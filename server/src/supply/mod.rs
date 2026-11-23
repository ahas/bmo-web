//! Supply: who pays for a run, and on whose credential it goes out (docs/accounts.md, 「Supply」). The
//! service reads the policy layers and resolves the order a person's runs take, answers the agency's hook
//! from them, and settles what a run costs against the source that paid — the plan's included usage as
//! sumida's amount quota, and a credit wallet as sumida's hold. The agency is the one consumer of an order;
//! the console reads and changes the same rows through the routes beside this one.
//!
//! A source key is one of `personal`, `global`, `org_credits` and `personal_credits`; `stop` names the end
//! of an order and is never a source. The keys are this service's own data: nothing here names a unit, an
//! agent or a person.

pub mod hook;
pub mod plans;
pub mod routes;

use std::collections::BTreeMap;

use bmo_web_client::{ChainKind, ChainLevel, ChainMode, ChainPersonWriter, ChainShape};
use sea_orm::{ConnectionTrait, TransactionTrait};
use serde_json::json;
use sumida::api::authz::Authz;
use sumida::entity::membership::OwnerKind;

use crate::chain::{self, Link, Subject};
use crate::users::user_subject;
use crate::{Refusal, one, run};

/// The membership action every supply ask is metered under: the plan's amount quota, the quota ledger and
/// the credit cost all stand on it.
pub const ACTION: &str = "supply";

/// The five source keys, `stop` last.
pub const ALL: [Source; 5] = [
  Source::Personal,
  Source::Global,
  Source::OrgCredits,
  Source::PersonalCredits,
  Source::Stop,
];

/// The four sources a run pays through.
pub const PAYABLE: [Source; 4] =
  [Source::Personal, Source::Global, Source::OrgCredits, Source::PersonalCredits];

/// Who pays for a run, and on whose credential it goes out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
  /// The person's own credential, paid to the provider.
  Personal,
  /// The platform's credential, paid from the plan's included usage.
  Global,
  /// The platform's credential, paid from the organisation's credit wallet.
  OrgCredits,
  /// The platform's credential, paid from the person's own credit wallet.
  PersonalCredits,
  /// The person's organisation's own credential, its usage counted as organisation credits: a source the agency
  /// takes on its own reading of the delegation chain, never one a policy names (「Organisation supply」).
  Organisation,
  /// Nothing left; always last in every order, never answered to the agency.
  Stop,
}

impl Source {
  /// The key as it stands in code, in every stored list and on the wire.
  pub fn key(self) -> &'static str {
    match self {
      Source::Personal => "personal",
      Source::Global => "global",
      Source::OrgCredits => "org_credits",
      Source::PersonalCredits => "personal_credits",
      Source::Organisation => "organisation",
      Source::Stop => "stop",
    }
  }

  pub fn parse(key: &str) -> Option<Self> {
    match key {
      "personal" => Some(Source::Personal),
      "global" => Some(Source::Global),
      "org_credits" => Some(Source::OrgCredits),
      "personal_credits" => Some(Source::PersonalCredits),
      "organisation" => Some(Source::Organisation),
      "stop" => Some(Source::Stop),
      _ => None,
    }
  }

  /// Whether the source is one a run goes out on; `stop` is nothing left.
  pub fn payable(self) -> bool {
    !matches!(self, Source::Stop)
  }

  /// Whether a policy or a person's own setting may name it: every source but the organisation's own supply,
  /// which the delegation chain opens and no policy orders.
  pub fn ordered(self) -> bool {
    !matches!(self, Source::Organisation)
  }

  /// Whether its spend counts as organisation credits, which a person's allowance and an organisation's member cap
  /// hold.
  pub fn organisation_credits(self) -> bool {
    matches!(self, Source::OrgCredits | Source::Organisation)
  }
}

/// Which layer closed a source: the plan never carried it, the organisation forbade it, or an administrator
/// withheld it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Closed {
  NotInPlan,
  BlockedByOrganisation,
  BlockedByAdministrator,
}

impl Closed {
  pub fn code(self) -> &'static str {
    match self {
      Closed::NotInPlan => "not-in-plan",
      Closed::BlockedByOrganisation => "blocked-by-organisation",
      Closed::BlockedByAdministrator => "blocked-by-administrator",
    }
  }

  fn name(self) -> &'static str {
    match self {
      Closed::NotInPlan => "the plan",
      Closed::BlockedByOrganisation => "the organisation",
      Closed::BlockedByAdministrator => "an administrator",
    }
  }
}

/// One source's standing in a resolution: whether the reader may use it, and which layer closed it where
/// they may not.
#[derive(Debug, Clone, Copy)]
pub struct Standing {
  pub allowed: bool,
  pub closed_by: Option<Closed>,
  /// Whether the reader has the source switched off, where they may use it.
  pub off: bool,
  /// Whether the platform holds the source as it says for everyone, out of reach of a person's own setting.
  pub locked: bool,
}

/// The platform policy: the sources it turns on, its order, the sources a person's own setting may switch
/// against that default, and whether a person's own order is read.
pub struct PlatformPolicy {
  pub allowed: Vec<Source>,
  pub order: Vec<Source>,
  pub overridable: Vec<Source>,
  pub order_overridable: bool,
}

impl PlatformPolicy {
  /// Whether the platform turns the source on, the default a person starts from where it is overridable.
  pub fn on(&self, source: Source) -> bool {
    self.allowed.contains(&source)
  }

  /// Whether a person's own setting cannot change the source.
  pub fn locked(&self, source: Source) -> bool {
    !self.overridable.contains(&source)
  }

  /// Whether the layers below may use the source at all: it is on, or a person may switch it on.
  pub fn available(&self, source: Source) -> bool {
    self.on(source) || !self.locked(source)
  }
}

/// The platform's money settings: the conversion of a US-dollar cost into credits, the size of one
/// reservation, and whether an exhausted source refuses a run.
pub struct PlatformSettings {
  pub credits_per_dollar: i64,
  pub reservation_credits: i64,
  pub enforce: bool,
}

impl PlatformSettings {
  /// What a US-dollar cost is in credits.
  pub fn credits(&self, usd: f64) -> i64 {
    (usd * self.credits_per_dollar as f64).round().max(0.0) as i64
  }

  /// What a count of credits is in US dollars.
  pub fn dollars(&self, credits: i64) -> f64 {
    credits as f64 / self.credits_per_dollar as f64
  }
}

/// A policy as one unit or one person holds it. The member credit cap is a cap on what one person may spend
/// of the capped source in a calendar month; none where it is absent.
#[derive(Debug, Clone)]
pub struct Policy {
  pub allowed: Vec<Source>,
  pub order: Vec<Source>,
  pub member_credit_credits: Option<i64>,
  /// The unit whose row stands, where the unit named inherits one from above.
  pub from: Option<i64>,
}

/// A person's own setting. `off` and `on` hold the overridable sources the person switched off and on
/// against the platform's default; a source in neither stands as that default says.
#[derive(Debug, Clone)]
pub struct OwnSetting {
  pub order: Vec<Source>,
  pub off: Vec<Source>,
  pub on: Vec<Source>,
  pub personal_credit_credits: Option<i64>,
}

/// How the subscription a person's supply stands under includes this period: whether it includes global
/// supply at all, how much of its quota is left, whether credits may be spent, and when the period turns.
#[derive(Debug, Clone)]
pub struct PlanUsage {
  pub included: bool,
  /// The remaining included credits of the period; none where the plan carries no quota to count.
  pub remaining: Option<i64>,
  pub credits_usable: bool,
  /// When the period ends and the quota refills, in epoch milliseconds.
  pub reopens_at: Option<i64>,
  /// Who holds the subscription — the person, or their unit or the nearest unit above — whose quota a
  /// `global` reservation runs against; none where no subscription stands.
  pub owner: Option<(OwnerKind, i32)>,
}

impl PlanUsage {
  fn none() -> Self {
    PlanUsage {
      included: false,
      remaining: None,
      credits_usable: false,
      reopens_at: None,
      owner: None,
    }
  }
}

/// How far a resolution has walked: which layers have narrowed what the layers above allow.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Depth {
  /// The platform policy and the plan's inclusion.
  Plan,
  /// The nearest organisation policy too.
  Organisation,
  /// The administrator's per-user policy too.
  Administrator,
  /// The person's own setting too.
  Own,
}

/// The resolved order of one person, and the standing of every source (docs/accounts.md, 「Supply」).
pub struct Resolution {
  /// The order as resolved at the depth read, `stop` last.
  pub order: Vec<Source>,
  /// Whether the platform locks the order, so the person's own order is not read.
  pub order_locked: bool,
  pub standing: BTreeMap<&'static str, Standing>,
  pub plan: PlanUsage,
  /// How far this resolution walked.
  pub depth: Depth,
  /// The person the order was resolved for.
  pub user: i64,
}

/// How `stop` stands in every resolution: always there, last, and no setting moves it.
const STOP: Standing = Standing {
  allowed: true,
  closed_by: None,
  off: false,
  locked: true,
};

impl Resolution {
  /// The standing of one source: every payable source's as the layers left it, and `stop`'s, which nothing
  /// changes. A written key is read here safely, whatever it names.
  pub fn of(&self, source: Source) -> Standing {
    self.standing.get(source.key()).copied().unwrap_or(STOP)
  }

  /// The order as the hook answers it: the payable sources in their order, `stop` left out.
  pub fn answer(&self) -> Vec<Source> {
    self.order.iter().copied().filter(|source| source.payable()).collect()
  }
}

/// Every row of a stored source list, refused where one is no key.
fn sources_of(list: &serde_json::Value) -> Result<Vec<Source>, Refusal> {
  let items = list.as_array().ok_or_else(|| {
    Refusal::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, "a stored source list is no list")
  })?;
  let mut out = Vec::with_capacity(items.len());

  for item in items {
    let key = item.as_str().unwrap_or_default();
    out.push(Source::parse(key).ok_or_else(|| {
      Refusal::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("`{key}` is no source key"))
    })?);
  }

  Ok(out)
}

fn keys(sources: &[Source]) -> Vec<&'static str> {
  sources.iter().map(|source| source.key()).collect()
}

/// The kind the supply policies stand as on the delegation chain (docs/accounts.md, 「The delegation chain」): the
/// platform's link holds `allowed`, `order`, `overridable` and `orderOverridable`, a unit's and a person's
/// `allowed`, `order` and `memberCreditCredits`, and supply composes the layers itself.
pub fn policy_kind() -> ChainKind {
  ChainKind {
    key: "supply.policy".to_owned(),
    declared_by: crate::holdings::UNIT.to_owned(),
    description:
      "The supply policy: the platform's, an organisation's and an administrator's for one person."
        .to_owned(),
    shape: ChainShape::Json,
    choices: vec![],
    mode: ChainMode::Layered,
    default: Some(json!({
      "allowed": ["personal"],
      "order": ["personal", "stop"],
      "overridable": ["personal"],
      "orderOverridable": true,
    })),
    rules: false,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit, ChainLevel::Person],
    unit_permission: CREDIT.to_owned(),
    person_writer: ChainPersonWriter::Heads,
  }
}

/// The kind a person's own supply setting stands as: `order`, `off`, `on` and `personalCreditCredits` on their link.
pub fn own_kind() -> ChainKind {
  ChainKind {
    key: "supply.own".to_owned(),
    declared_by: crate::holdings::UNIT.to_owned(),
    description:
      "A person's own supply setting: their order, the sources switched off and on, and their cap."
        .to_owned(),
    shape: ChainShape::Json,
    choices: vec![],
    mode: ChainMode::Nearest,
    default: None,
    rules: false,
    levels: vec![ChainLevel::Person],
    unit_permission: CREDIT.to_owned(),
    person_writer: ChainPersonWriter::Own,
  }
}

/// The kind a person's credit allowance stands as: the organisation credits they may spend in a calendar month,
/// `unlimited` where nothing narrows it, set for a person, a group or a unit by rules at any link.
pub fn allowance_kind() -> ChainKind {
  ChainKind {
    key: "supply.credit-allowance".to_owned(),
    declared_by: crate::holdings::UNIT.to_owned(),
    description: "The organisation credits one person may spend in a calendar month.".to_owned(),
    shape: ChainShape::Amount,
    choices: vec![],
    mode: ChainMode::Narrowing,
    default: Some(json!(crate::chain::UNLIMITED)),
    rules: true,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit, ChainLevel::Person],
    unit_permission: CREDIT.to_owned(),
    person_writer: ChainPersonWriter::Heads,
  }
}

/// The sumida organisation permission a unit's supply is kept under: its credit manager's and its heads'.
const CREDIT: &str = "manage_credit";

/// The platform policy as its link stores it.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPlatform {
  allowed: Vec<String>,
  order: Vec<String>,
  overridable: Vec<String>,
  order_overridable: bool,
}

/// An organisation's or a per-user policy as its link stores it.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPolicy {
  allowed: Vec<String>,
  order: Vec<String>,
  #[serde(default)]
  member_credit_credits: Option<i64>,
}

/// A person's own setting as their link stores it.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredOwn {
  order: Vec<String>,
  off: Vec<String>,
  on: Vec<String>,
  #[serde(default)]
  personal_credit_credits: Option<i64>,
}

fn unstored<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T, Refusal> {
  serde_json::from_value(value).map_err(|why| {
    Refusal::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("a stored supply value: {why}"))
  })
}

fn listed(keys: &[String]) -> Result<Vec<Source>, Refusal> {
  sources_of(&json!(keys))
}

fn policy_of(value: serde_json::Value, from: Option<i64>) -> Result<Policy, Refusal> {
  let stored: StoredPolicy = unstored(value)?;

  Ok(Policy {
    allowed: listed(&stored.allowed)?,
    order: listed(&stored.order)?,
    member_credit_credits: stored.member_credit_credits,
    from,
  })
}

/// The platform policy, as it stands: the platform's link, the kind's default where it holds none.
pub async fn platform_policy(db: &impl ConnectionTrait) -> Result<PlatformPolicy, Refusal> {
  let kind = policy_kind();
  let value = chain::value_at(db, &kind.key, Link::Platform)
    .await?
    .or(kind.default)
    .expect("the policy kind carries a default");
  let stored: StoredPlatform = unstored(value)?;

  Ok(PlatformPolicy {
    allowed: listed(&stored.allowed)?,
    order: listed(&stored.order)?,
    overridable: listed(&stored.overridable)?,
    order_overridable: stored.order_overridable,
  })
}

/// The platform's money settings, as they stand.
pub async fn platform_settings(db: &impl ConnectionTrait) -> Result<PlatformSettings, Refusal> {
  let row = one(
    db,
    r#"SELECT "credits_per_dollar", "reservation_credits", "enforce"
       FROM "supply_settings" WHERE "id" = 1"#,
    vec![],
  )
  .await?
  .expect("the migration seeds the platform settings");

  Ok(PlatformSettings {
    credits_per_dollar: row.try_get("", "credits_per_dollar")?,
    reservation_credits: row.try_get("", "reservation_credits")?,
    enforce: row.try_get("", "enforce")?,
  })
}

/// The parent of a unit, or none where it stands at the top of the tree.
pub async fn parent_of(db: &impl ConnectionTrait, unit: i64) -> Result<Option<i64>, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT "parent_id" AS "parent" FROM "organizations" WHERE "id" = $1"#,
      vec![(unit as i32).into()],
    )
    .await?
    .map(|row| row.try_get::<Option<i32>>("", "parent"))
    .transpose()?
    .flatten()
    .map(i64::from),
  )
}

/// The organisation policy in force for a unit: its own, else the nearest one going up, else none.
pub async fn org_policy<C: ConnectionTrait>(db: &C, unit: i64) -> Result<Option<Policy>, Refusal> {
  let (_, resolved) = chain::resolve(db, &policy_kind(), Subject::Unit(unit as i32)).await?;
  let nearest = resolved.layers.into_iter().rev().find_map(|layer| match layer.link {
    Link::Unit(from) => Some((from, layer.value)),
    _ => None,
  });

  nearest.map(|(from, value)| policy_of(value, Some(i64::from(from)))).transpose()
}

/// The per-user policy standing for a person, where an administrator set one.
pub async fn user_policy<C: ConnectionTrait>(db: &C, user: i64) -> Result<Option<Policy>, Refusal> {
  let (_, resolved) = chain::resolve(db, &policy_kind(), Subject::Person(user as i32)).await?;
  let own = resolved.layers.into_iter().find(|layer| layer.link == Link::Person(user as i32));

  own.map(|layer| policy_of(layer.value, Some(user))).transpose()
}

/// The person's own setting, or the default: no order of their own, nothing switched either way against the
/// platform's default and no cap of their own.
pub async fn own_setting<C: ConnectionTrait>(db: &C, user: i64) -> Result<OwnSetting, Refusal> {
  let (_, resolved) = chain::resolve(db, &own_kind(), Subject::Person(user as i32)).await?;
  let Some(value) = resolved.value else {
    return Ok(OwnSetting {
      order: Vec::new(),
      off: Vec::new(),
      on: Vec::new(),
      personal_credit_credits: None,
    });
  };
  let stored: StoredOwn = unstored(value)?;

  Ok(OwnSetting {
    order: listed(&stored.order)?,
    off: listed(&stored.off)?,
    on: listed(&stored.on)?,
    personal_credit_credits: stored.personal_credit_credits,
  })
}

/// A person's credit allowance as the chain resolves it, and whether the person's own link set the smallest; none
/// where it is unlimited.
pub async fn credit_allowance<C: ConnectionTrait>(
  db: &C,
  user: i64,
) -> Result<Option<(i64, bool)>, Refusal> {
  let (_, resolved) = chain::resolve(db, &allowance_kind(), Subject::Person(user as i32)).await?;
  let Some(allowance) = resolved.value.as_ref().and_then(serde_json::Value::as_i64) else {
    return Ok(None);
  };
  let by_person = resolved
    .layers
    .iter()
    .any(|layer| layer.link == Link::Person(user as i32) && layer.value.as_i64() == Some(allowance));

  Ok(Some((allowance, by_person)))
}

/// The live subscription a person's supply stands under, read whole with this period's usage and holds. A
/// retired plan's subscription stands on its snapshot until its period ends.
struct Plan {
  /// Whether the subscription's plan lets its owner pay from a wallet: the supply action carries a credit
  /// cost.
  credits_usable: bool,
  /// Whether the plan carries global supply: its snapshot holds the supply action.
  covers: bool,
  /// The period's amount quota for the action; none where the snapshot names no limit.
  quota: Option<i64>,
  used: i64,
  held: i64,
  /// When the period ends, in epoch milliseconds.
  ends_at: i64,
}

const PLAN_SQL: &str = r#"
  SELECT (a."credit_cost" IS NOT NULL) AS "priced",
         s."allowed_actions" ? 'supply' AS "covers",
         (s."amount_quotas" ->> 'supply')::bigint AS "quota",
         COALESCE(u."amount_used", 0) AS "used",
         COALESCE(h."held", 0) AS "held",
         (EXTRACT(EPOCH FROM s."current_period_end") * 1000)::bigint AS "ends_at"
    FROM "subscriptions" s
    JOIN "membership_plans" p ON p."id" = s."plan_id"
    LEFT JOIN "plan_actions" a ON a."plan_id" = s."plan_id" AND a."action" = $3
    LEFT JOIN "subscription_usage" u
           ON u."subscription_id" = s."id" AND u."action" = $3 AND u."period_start" = s."current_period_start"
    LEFT JOIN (SELECT "subscription_id", "action", "period_start", SUM("amount")::bigint AS "held"
                 FROM "quota_reservations"
                WHERE "status" = 'held' AND "expires_at" > now()
                GROUP BY "subscription_id", "action", "period_start") h
           ON h."subscription_id" = s."id" AND h."action" = $3 AND h."period_start" = s."current_period_start"
   WHERE s."owner_kind" = $1 AND s."owner_id" = $2
     AND ((s."status" = 'active' AND s."current_period_end" > now())
       OR (s."status" = 'past-due' AND s."grace_ends_at" IS NOT NULL AND s."grace_ends_at" > now()))
   ORDER BY s."current_period_end" DESC
   LIMIT 1"#;

async fn plan_of<C: ConnectionTrait>(
  db: &C,
  owner_kind: &str,
  owner_id: i64,
) -> Result<Option<Plan>, Refusal> {
  let row = one(db, PLAN_SQL, vec![owner_kind.into(), (owner_id as i32).into(), ACTION.into()]).await?;

  Ok(match row {
    Some(row) => Some(Plan {
      credits_usable: row.try_get::<Option<bool>>("", "priced")?.unwrap_or(false),
      covers: row.try_get("", "covers")?,
      quota: row.try_get::<Option<i64>>("", "quota")?,
      used: row.try_get("", "used")?,
      held: row.try_get("", "held")?,
      ends_at: row.try_get("", "ends_at")?,
    }),
    None => None,
  })
}

impl Plan {
  fn usage(&self, owner: (OwnerKind, i32)) -> PlanUsage {
    PlanUsage {
      included: self.covers,
      remaining: self.quota.map(|quota| (quota - self.used - self.held).max(0)),
      credits_usable: self.credits_usable,
      reopens_at: Some(self.ends_at),
      owner: Some(owner),
    }
  }
}

/// The subscription the person's supply stands under: their own personal one, else the first organisation
/// subscription found going up from their unit.
pub async fn subscription_of<C: ConnectionTrait>(
  db: &C,
  user: i64,
  unit: i64,
) -> Result<Option<PlanUsage>, Refusal> {
  if let Some(plan) = plan_of(db, "personal", user).await? {
    return Ok(Some(plan.usage((OwnerKind::Personal, user as i32))));
  }

  let mut here = unit;

  loop {
    if let Some(plan) = plan_of(db, "organization", here).await? {
      return Ok(Some(plan.usage((OwnerKind::Organization, here as i32))));
    }

    match parent_of(db, here).await? {
      Some(parent) => here = parent,
      None => return Ok(None),
    }
  }
}

/// A credit wallet as it stands: balance, what live holds keep, and what is owed.
pub async fn wallet<C: ConnectionTrait>(
  db: &C,
  owner_kind: &str,
  owner_id: i64,
) -> Result<Option<Wallet>, Refusal> {
  let row = one(
    db,
    r#"SELECT w."id", w."balance", w."debt",
              COALESCE((SELECT SUM(r."amount")::bigint FROM "credit_reservations" r
                         WHERE r."wallet_id" = w."id" AND r."status" = 'held'
                           AND (r."expires_at" IS NULL OR r."expires_at" > now())), 0) AS "held"
         FROM "credit_wallets" w WHERE w."owner_kind" = $1 AND w."owner_id" = $2"#,
    vec![owner_kind.into(), (owner_id as i32).into()],
  )
  .await?;

  Ok(match row {
    Some(row) => Some(Wallet {
      id: row.try_get("", "id")?,
      balance: row.try_get("", "balance")?,
      reserved: row.try_get("", "held")?,
      debt: row.try_get("", "debt")?,
    }),
    None => None,
  })
}

/// A credit wallet as it stands.
#[derive(Debug, Clone, Copy)]
pub struct Wallet {
  pub id: i32,
  pub balance: i64,
  pub reserved: i64,
  pub debt: i64,
}

impl Wallet {
  /// What the wallet can spend now.
  pub fn spendable(&self) -> i64 {
    (self.balance - self.reserved - self.debt).max(0)
  }

  /// When the first live hold ends and part of the balance frees again, if a hold stands.
  pub async fn reopens_at<C: ConnectionTrait>(&self, db: &C) -> Result<Option<i64>, Refusal> {
    Ok(
      one(
        db,
        r#"SELECT EXTRACT(EPOCH FROM MIN("expires_at")) * 1000 AS "reopens"
           FROM "credit_reservations"
           WHERE "wallet_id" = $1 AND "status" = 'held' AND "expires_at" > now()"#,
        vec![self.id.into()],
      )
      .await?
      .and_then(|row| row.try_get::<Option<f64>>("", "reopens").ok().flatten())
      .map(|reopens| reopens as i64),
    )
  }
}

/// The calendar month a moment falls in, as `supply_costs` keeps it.
pub fn period(at: i64) -> String {
  let (days, _) = (at.div_euclid(86_400_000), at.rem_euclid(86_400_000));
  let (year, month, _) = civil_from_days(days);

  format!("{year:04}-{month:02}")
}

/// The civil date of a count of days since the epoch (Howard Hinnant's `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
  let z = days + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let y = yoe + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };

  (if m <= 2 { y + 1 } else { y }, m as u32, d as u32)
}

/// What one person has spent per source this calendar month: credits and US-dollar cost in millionths.
pub async fn usage<C: ConnectionTrait>(db: &C, user: i64) -> Result<Vec<(Source, i64, i64)>, Refusal> {
  let rows = crate::all(
    db,
    r#"SELECT "source", SUM("credits")::bigint AS "credits", SUM("cost_micros")::bigint AS "micros"
       FROM "supply_costs" WHERE "user_id" = $1 AND "period" = $2
       GROUP BY "source" ORDER BY "source""#,
    vec![user.into(), period(crate::now_ms()).into()],
  )
  .await?;
  let mut out = Vec::new();

  for row in &rows {
    let source = Source::parse(&row.try_get::<String>("", "source")?)
      .filter(|source| source.payable())
      .expect("a settled cost names a payable source");

    out.push((source, row.try_get("", "credits")?, row.try_get("", "micros")?));
  }

  Ok(out)
}

/// What one source has cost a person this calendar month, in credits: organisation credits counting the
/// organisation's own supply beside them.
pub async fn spent<C: ConnectionTrait>(db: &C, user: i64, source: Source) -> Result<i64, Refusal> {
  let counted = if source.organisation_credits() {
    vec![Source::OrgCredits.key(), Source::Organisation.key()]
  } else {
    vec![source.key()]
  };

  Ok(
    one(
      db,
      r#"SELECT COALESCE(SUM("credits")::bigint, 0) AS "spent" FROM "supply_costs"
         WHERE "user_id" = $1 AND "source" = ANY($2::text[]) AND "period" = $3"#,
      vec![
        user.into(),
        sea_orm::Value::from(counted.into_iter().map(str::to_owned).collect::<Vec<_>>()),
        period(crate::now_ms()).into(),
      ],
    )
    .await?
    .map(|row| row.try_get::<i64>("", "spent"))
    .transpose()?
    .unwrap_or(0),
  )
}

/// A person's own organisation, as sumida keeps it on the user row.
pub async fn home_unit<C: ConnectionTrait>(db: &C, user: i64) -> Result<i64, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT "organization_id" AS "unit" FROM "users" WHERE "id" = $1"#,
      vec![(user as i32).into()],
    )
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?
    .try_get::<i32>("", "unit")? as i64,
  )
}

/// The order one layer leaves: the sources it names first, in its order, and what it names nowhere behind
/// them in the order they stood — the layer's allow list having already taken out what it closes.
fn narrowed(order: &[Source], allowed: &[Source], base: &[Source]) -> Vec<Source> {
  let mut out: Vec<Source> = Vec::new();

  for source in order.iter().copied().filter(|source| allowed.contains(source) && base.contains(source)) {
    out.push(source);
  }
  // The sources the layer names nowhere keep their standing order, appended behind what it names. Read the
  // whole list first: the filter holds the order it tests against while the loop below grows it.
  let rest: Vec<Source> = base
    .iter()
    .copied()
    .filter(|source| allowed.contains(source) && !out.contains(source))
    .collect();
  out.extend(rest);

  out
}

/// The resolved order of one person to a depth: every layer narrowing what the layers above allow, and the
/// standing of each source at that depth (docs/accounts.md, 「Supply」).
pub async fn resolve_to<C: ConnectionTrait>(
  db: &C,
  user: i64,
  depth: Depth,
) -> Result<Resolution, Refusal> {
  let unit = home_unit(db, user).await?;
  let platform = platform_policy(db).await?;
  let plan = match subscription_of(db, user, unit).await? {
    Some(plan) => plan,
    None => PlanUsage::none(),
  };
  let org = if depth == Depth::Plan { None } else { org_policy(db, unit).await? };
  let personal = match depth {
    Depth::Plan | Depth::Organisation => None,
    Depth::Administrator | Depth::Own => user_policy(db, user).await?,
  };
  let setting = if depth == Depth::Own { Some(own_setting(db, user).await?) } else { None };

  let mut standing = BTreeMap::new();

  // The platform opens to the layers below every source it turns on or leaves overridable; one it neither
  // turns on nor leaves overridable is closed everywhere.
  for source in PAYABLE {
    standing.insert(
      source.key(),
      Standing {
        allowed: platform.available(source),
        closed_by: None,
        off: false,
        locked: platform.locked(source),
      },
    );
  }
  let mut order: Vec<Source> = platform
    .order
    .iter()
    .copied()
    .filter(|source| source.payable() && platform.available(*source))
    .collect();

  // A source the platform opens but names nowhere in its order keeps its standing place, as at every layer
  // below it: an order is a preference over what is allowed, and the platform opens a source by allowing it.
  for source in PAYABLE {
    if platform.available(source) && !order.contains(&source) {
      order.push(source);
    }
  }

  // The plan's inclusion: global rides on the plan carrying it with room left, credits on the plan letting
  // them be spent at all.
  for source in [Source::Global, Source::OrgCredits, Source::PersonalCredits] {
    let closed = match source {
      Source::Global => !plan.included || plan.remaining == Some(0),
      Source::OrgCredits | Source::PersonalCredits => !plan.credits_usable,
      _ => unreachable!("global and the credit sources are read above"),
    };

    if closed {
      close(&mut order, &mut standing, source, Closed::NotInPlan);
    }
  }

  // The nearest organisation policy, then the administrator's per-user policy: each narrows both lists.
  for (policy, by) in [
    (org.clone(), Closed::BlockedByOrganisation),
    (personal.clone(), Closed::BlockedByAdministrator),
  ] {
    let Some(policy) = policy else { continue };

    for source in PAYABLE {
      if !policy.allowed.contains(&source) {
        close(&mut order, &mut standing, source, by);
      }
    }
    order = narrowed(&policy.order, &policy.allowed, &order);
  }

  // A member cap the month's spend has reached closes the source it caps: the organisation's cap on
  // organisation credits is the organisation's standing, and a per-user cap is the administrator's.
  if let Some(cap) = org.as_ref().and_then(|org| org.member_credit_credits)
    && spent(db, user, Source::OrgCredits).await? >= cap
  {
    close(&mut order, &mut standing, Source::OrgCredits, Closed::BlockedByOrganisation);
  }
  if let Some(cap) = personal.as_ref().and_then(|personal| personal.member_credit_credits)
    && spent(db, user, Source::OrgCredits).await? >= cap
  {
    close(&mut order, &mut standing, Source::OrgCredits, Closed::BlockedByAdministrator);
  }

  // The person's credit allowance on the chain closes organisation credits once the month's spend reaches it.
  if matches!(depth, Depth::Administrator | Depth::Own)
    && let Some((allowance, by_person)) = credit_allowance(db, user).await?
    && spent(db, user, Source::OrgCredits).await? >= allowance
  {
    let by = if by_person { Closed::BlockedByAdministrator } else { Closed::BlockedByOrganisation };

    close(&mut order, &mut standing, Source::OrgCredits, by);
  }

  // The person's own setting: each overridable source switched against the platform's default or standing as
  // it says, a locked one as the platform says whatever the setting holds, and a reorder where the platform
  // reads the person's order.
  if let Some(setting) = setting {
    for source in PAYABLE {
      let state = standing[source.key()];

      if !state.allowed || state.locked {
        continue;
      }

      let on = if setting.on.contains(&source) {
        true
      } else if setting.off.contains(&source) {
        false
      } else {
        platform.on(source)
      };

      if !on {
        switch_off(&mut order, &mut standing, source);
      }
    }
    if let Some(cap) = setting.personal_credit_credits
      && standing[Source::PersonalCredits.key()].allowed
      && spent(db, user, Source::PersonalCredits).await? >= cap
    {
      switch_off(&mut order, &mut standing, Source::PersonalCredits);
    }
    if platform.order_overridable && !setting.order.is_empty() {
      let allowed: Vec<Source> =
        PAYABLE.into_iter().filter(|source| standing[source.key()].allowed).collect();

      order = narrowed(&setting.order, &allowed, &order);
    }
  }

  Ok(Resolution {
    order: order_with_stop(&order),
    order_locked: !platform.order_overridable,
    standing,
    plan,
    depth,
    user,
  })
}

/// The fully resolved order of one person, every layer read.
pub async fn resolve<C: ConnectionTrait>(db: &C, user: i64) -> Result<Resolution, Refusal> {
  resolve_to(db, user, Depth::Own).await
}

// A source closed: out of the order and of the allowed list, with the layer named — once, so a later layer
// closing it too never overnames the first.
fn close(
  order: &mut Vec<Source>,
  standing: &mut BTreeMap<&'static str, Standing>,
  source: Source,
  by: Closed,
) {
  order.retain(|held| *held != source);

  let state = standing.get_mut(source.key()).expect("every payable source is read");

  if state.allowed {
    *state = Standing {
      allowed: false,
      closed_by: Some(by),
      off: false,
      ..*state
    };
  }
}

// A source the person may use switched off: out of the order, marked off.
fn switch_off(order: &mut Vec<Source>, standing: &mut BTreeMap<&'static str, Standing>, source: Source) {
  order.retain(|held| *held != source);

  let state = standing.get_mut(source.key()).expect("every payable source is read");

  state.off = true;
}

/// Every order stands with `stop` last.
pub fn order_with_stop(order: &[Source]) -> Vec<Source> {
  let mut out: Vec<Source> = order.iter().copied().filter(|source| source.payable()).collect();

  out.push(Source::Stop);
  out
}

/// A written list of sources, refused where one is no key.
fn named(list: &[String]) -> Result<Vec<Source>, Refusal> {
  let mut out = Vec::with_capacity(list.len());

  for key in list {
    out.push(
      Source::parse(key)
        .filter(|source| source.ordered())
        .ok_or_else(|| Refusal::bad(format!("`{key}` is no source key")))?,
    );
  }

  Ok(out)
}

/// A written order: `stop` may stand last, as every order is read back, and is dropped there, since the
/// service appends it itself; named anywhere else it is refused.
fn ordered(list: &[String]) -> Result<Vec<Source>, Refusal> {
  let mut order = named(list)?;

  if order.last() == Some(&Source::Stop) {
    order.pop();
  }
  if order.contains(&Source::Stop) {
    return Err(Refusal::bad("`stop` stands last in every order and nowhere else"));
  }

  Ok(order)
}

/// A write may name only sources its earlier layers allow — a later layer narrows, never opens — and the
/// refusal is the closer's own code.
pub fn check_writable(resolved: &Resolution, sources: &[Source], what: &str) -> Result<(), Refusal> {
  for source in sources {
    if !source.payable() {
      return Err(Refusal::bad(format!("`{}` is no source a {} may name", source.key(), what)));
    }

    let state = resolved.of(*source);

    if !state.allowed {
      return Err(
        Refusal::forbidden(format!(
          "`{}` is closed by {} and cannot be opened by this write",
          source.key(),
          state.closed_by.map_or("a layer above", Closed::name)
        ))
        .coded(state.closed_by.map_or("source-not-allowed", Closed::code)),
      );
    }
  }

  Ok(())
}

/// A written order is refused where it names `stop` or drops a source the writer may use: a layer narrows
/// what it allows, never what it orders, and `stop` is appended by the service itself.
pub fn check_order(allowed: &[Source], order: &[Source]) -> Result<(), Refusal> {
  for source in order {
    if !source.payable() {
      return Err(Refusal::bad("`stop` is appended to every order and is never named in one"));
    }
    if !allowed.contains(source) {
      return Err(Refusal::bad(format!("`{}` is not among the allowed sources", source.key())));
    }
  }
  for source in allowed {
    if !order.contains(source) {
      return Err(Refusal::bad(format!("`{}` is allowed and stands missing from the order", source.key())));
    }
  }

  Ok(())
}

/// The platform policy and money settings changed, whole or in part, by a platform administrator. The order
/// names every source the platform opens — on or overridable — and nothing else.
pub async fn set_platform(
  db: &(impl ConnectionTrait + TransactionTrait),
  actor: i64,
  ask: &bmo_web_client::SupplyPlatformAsk,
) -> Result<(), Refusal> {
  let allowed = ask.allowed.as_deref().map(named).transpose()?;
  let order = ask.order.as_deref().map(ordered).transpose()?;
  let overridable = ask.overridable.as_deref().map(named).transpose()?;

  for list in [&allowed, &overridable].into_iter().flatten() {
    if list.iter().any(|source| !source.payable()) {
      return Err(Refusal::bad("`stop` is no source the platform turns on or leaves overridable"));
    }
  }
  if let Some(order) = &order {
    let standing = platform_policy(db).await?;
    let next = PlatformPolicy {
      allowed: allowed.clone().unwrap_or(standing.allowed),
      order: order.clone(),
      overridable: overridable.clone().unwrap_or(standing.overridable),
      order_overridable: standing.order_overridable,
    };

    check_order(&PAYABLE.into_iter().filter(|source| next.available(*source)).collect::<Vec<_>>(), order)?;
  }
  if ask.credits_per_dollar.is_some_and(|rate| rate <= 0)
    || ask.reservation_credits.is_some_and(|size| size <= 0)
  {
    return Err(Refusal::bad("the conversion rate and the reservation size are numbers of one or more"));
  }

  let policy_changed =
    allowed.is_some() || order.is_some() || overridable.is_some() || ask.order_overridable.is_some();
  let settings_changed =
    ask.credits_per_dollar.is_some() || ask.reservation_credits.is_some() || ask.enforce.is_some();
  let txn = db.begin().await?;

  if policy_changed {
    let standing = platform_policy(&txn).await?;
    let stored = StoredPlatform {
      allowed: keys_of(&allowed.clone().unwrap_or(standing.allowed)),
      order: keys_of(&order.as_deref().map(order_with_stop).unwrap_or(standing.order)),
      overridable: keys_of(&overridable.clone().unwrap_or(standing.overridable)),
      order_overridable: ask.order_overridable.unwrap_or(standing.order_overridable),
    };

    chain::put_value(&txn, &policy_kind(), Link::Platform, Some(&json!(stored)), Some(actor as i32))
      .await?;
  }
  if settings_changed {
    run(
      &txn,
      r#"UPDATE "supply_settings"
             SET "credits_per_dollar" = COALESCE($1, "credits_per_dollar"),
                 "reservation_credits" = COALESCE($2, "reservation_credits"),
                 "enforce" = COALESCE($3, "enforce"),
                 "updated_at" = $4, "updated_by" = $5
           WHERE "id" = 1"#,
      vec![
        ask.credits_per_dollar.into(),
        ask.reservation_credits.into(),
        ask.enforce.into(),
        crate::now_ms().into(),
        actor.into(),
      ],
    )
    .await?;
  }

  if policy_changed {
    let shown =
      |list: Option<Vec<Source>>| list.map(|list| join(&list)).unwrap_or_else(|| "kept".to_owned());

    audit(
      &txn,
      actor,
      "policy",
      "platform",
      &format!(
        "allowed {}, order {}, overridable {}, order overridable {}",
        shown(allowed),
        shown(order.as_deref().map(order_with_stop)),
        shown(overridable),
        ask.order_overridable.map_or("kept".to_owned(), |open| open.to_string()),
      ),
    )
    .await?;
  }
  if settings_changed {
    audit(
      &txn,
      actor,
      "settings",
      "platform",
      &format!(
        "creditsPerDollar {}, reservationCredits {}, enforce {}",
        ask.credits_per_dollar.map_or("kept".to_owned(), |rate| rate.to_string()),
        ask.reservation_credits.map_or("kept".to_owned(), |size| size.to_string()),
        ask.enforce.map_or("kept".to_owned(), |enforce| enforce.to_string()),
      ),
    )
    .await?;
  }
  txn.commit().await?;

  Ok(())
}

/// Source keys as a stored list holds them.
fn keys_of(sources: &[Source]) -> Vec<String> {
  keys(sources).into_iter().map(str::to_owned).collect()
}

/// An organisation's or a per-user policy written on its link, `stop` last in its order.
async fn put_policy<C: ConnectionTrait>(
  db: &C,
  link: Link,
  allowed: &[Source],
  order: &[Source],
  cap: Option<i64>,
  actor: i64,
) -> Result<(), Refusal> {
  let stored = StoredPolicy {
    allowed: keys_of(allowed),
    order: keys_of(&order_with_stop(order)),
    member_credit_credits: cap,
  };

  chain::put_value(db, &policy_kind(), link, Some(&json!(stored)), Some(actor as i32)).await
}

fn join(sources: &[Source]) -> String {
  keys(sources).join(",")
}

/// An organisation policy written whole.
pub async fn set_org_policy(
  db: &(impl ConnectionTrait + TransactionTrait),
  actor: i64,
  unit: i64,
  ask: &bmo_web_client::SupplyPolicyAsk,
) -> Result<(), Refusal> {
  let allowed = named(&ask.allowed)?;
  let order = ordered(&ask.order)?;
  // An organisation policy narrows the platform policy alone: whose plan closes what is a fact of each person
  // beneath it, and the policy row itself may open nothing the platform closed.
  let platform = platform_policy(db).await?;

  for source in &allowed {
    if !source.payable() {
      return Err(Refusal::bad(format!("`{}` is no source a policy may name", source.key())));
    }
    if !platform.available(*source) {
      return Err(
        Refusal::forbidden(format!(
          "`{}` is closed by the platform and cannot be opened by this write",
          source.key()
        ))
        .coded("source-not-allowed"),
      );
    }
  }
  check_order(&allowed, &order)?;
  if ask.member_credit_credits.is_some_and(|cap| cap < 0) {
    return Err(Refusal::bad("a credit cap is a number of zero or more"));
  }

  let txn = db.begin().await?;

  put_policy(&txn, Link::Unit(unit as i32), &allowed, &order, ask.member_credit_credits, actor).await?;
  audit(
    &txn,
    actor,
    "policy",
    &format!("org {unit}"),
    &format!(
      "allowed {}, order {}, cap {}",
      join(&allowed),
      join(&order),
      ask.member_credit_credits.map_or("none".to_owned(), |cap| cap.to_string())
    ),
  )
  .await?;
  txn.commit().await?;

  Ok(())
}

/// An organisation policy taken away, so the unit inherits again.
pub async fn clear_org_policy(
  db: &(impl ConnectionTrait + TransactionTrait),
  actor: i64,
  unit: i64,
) -> Result<(), Refusal> {
  let txn = db.begin().await?;

  chain::put_value(&txn, &policy_kind(), Link::Unit(unit as i32), None, Some(actor as i32)).await?;
  audit(&txn, actor, "policy", &format!("org {unit}"), "inherited").await?;
  txn.commit().await?;

  Ok(())
}

/// A per-user policy written whole, narrowing only within the organisation the person stands under.
pub async fn set_user_policy(
  db: &(impl ConnectionTrait + TransactionTrait),
  actor: i64,
  user: i64,
  ask: &bmo_web_client::SupplyPolicyAsk,
) -> Result<(), Refusal> {
  let allowed = named(&ask.allowed)?;
  let order = ordered(&ask.order)?;
  let base = resolve_to(db, user, Depth::Organisation).await?;

  check_writable(&base, &allowed, "policy")?;
  check_order(&allowed, &order)?;
  if ask.member_credit_credits.is_some_and(|cap| cap < 0) {
    return Err(Refusal::bad("a credit cap is a number of zero or more"));
  }

  let txn = db.begin().await?;

  put_policy(&txn, Link::Person(user as i32), &allowed, &order, ask.member_credit_credits, actor).await?;
  audit(
    &txn,
    actor,
    "policy",
    &format!("user {user}"),
    &format!(
      "allowed {}, order {}, cap {}",
      join(&allowed),
      join(&order),
      ask.member_credit_credits.map_or("none".to_owned(), |cap| cap.to_string())
    ),
  )
  .await?;
  txn.commit().await?;

  Ok(())
}

/// A per-user policy taken away, so the person follows their organisation's again.
pub async fn clear_user_policy(
  db: &(impl ConnectionTrait + TransactionTrait),
  actor: i64,
  user: i64,
) -> Result<(), Refusal> {
  let txn = db.begin().await?;

  chain::put_value(&txn, &policy_kind(), Link::Person(user as i32), None, Some(actor as i32)).await?;
  audit(&txn, actor, "policy", &format!("user {user}"), "follows the organisation").await?;
  txn.commit().await?;

  Ok(())
}

/// The person's own setting written whole: a reorder, the overridable sources switched off and on against the
/// platform's default, and the person's own cap. A write is judged by what it changes against the setting
/// stored: a choice the person already holds passes as it stands, though a layer has since closed its source
/// or the platform locked it; a source newly switched on that a layer closed is refused by the closer's own
/// code, and one newly switched against a value the platform locks `locked-by-platform`. The order keeps the
/// sources standing open alone, a closed one it names dropped, and while the order is locked it is not read.
pub async fn set_own_setting(
  db: &(impl ConnectionTrait + TransactionTrait),
  user: i64,
  ask: &bmo_web_client::SupplySettingAsk,
) -> Result<(), Refusal> {
  let off = named(&ask.off)?;
  let on = named(&ask.on)?;
  let written = ordered(&ask.order)?;
  let platform = platform_policy(db).await?;
  let base = resolve_to(db, user, Depth::Administrator).await?;
  let stored = own_setting(db, user).await?;

  if let Some(source) = off.iter().chain(on.iter()).find(|source| !source.payable()) {
    return Err(Refusal::bad(format!("`{}` is no source a person switches", source.key())));
  }
  if let Some(source) = on.iter().find(|source| off.contains(source)) {
    return Err(Refusal::bad(format!("`{}` is switched both on and off", source.key())));
  }
  for (switched, held, to) in [(&on, &stored.on, true), (&off, &stored.off, false)] {
    let changed = || switched.iter().filter(|source| !held.contains(source));

    if let Some(source) = changed().find(|source| platform.locked(**source) && platform.on(**source) != to)
    {
      return Err(
        Refusal::forbidden(format!(
          "`{}` is locked by the platform and cannot be switched {}",
          source.key(),
          if to { "on" } else { "off" }
        ))
        .coded("locked-by-platform"),
      );
    }
    if to && let Some(source) = changed().find(|source| !base.of(**source).allowed) {
      let closed_by = base.of(*source).closed_by;

      return Err(
        Refusal::forbidden(format!(
          "`{}` is closed by {} and cannot be switched on",
          source.key(),
          closed_by.map_or("the platform", Closed::name)
        ))
        .coded(closed_by.map_or("source-not-allowed", Closed::code)),
      );
    }
  }

  // A locked order is neither read nor refused: the person's stored order stays as it stood, for the day the
  // platform reads it again.
  let order = if platform.order_overridable {
    let mut open: Vec<Source> = Vec::with_capacity(written.len());

    for source in written.into_iter().filter(|source| base.of(*source).allowed) {
      if !open.contains(&source) {
        open.push(source);
      }
    }

    open
  } else {
    stored.order
  };

  if ask.personal_credit_credits.is_some_and(|cap| cap < 0) {
    return Err(Refusal::bad("a credit cap is a number of zero or more"));
  }

  let txn = db.begin().await?;

  let stored = StoredOwn {
    order: keys_of(&order),
    off: keys_of(&off),
    on: keys_of(&on),
    personal_credit_credits: ask.personal_credit_credits,
  };

  chain::put_value(&txn, &own_kind(), Link::Person(user as i32), Some(&json!(stored)), Some(user as i32))
    .await?;
  audit(
    &txn,
    user,
    "policy",
    &format!("user {user} own"),
    &format!("order {}, off {}, on {}", join(&order), join(&off), join(&on)),
  )
  .await?;
  txn.commit().await?;

  Ok(())
}

/// The membership services read the acting person from a session; the console named them in `Owner-Key`,
/// and the session is stood from the user row and their standing here, never from a cookie.
pub(crate) async fn session(
  service: &crate::Service,
  user: i32,
) -> Result<sumida::infra::session::UserSession, Refusal> {
  use sumida::infra::session::{UserEnvironment, UserProfile, UserSession, UserState};

  let row = one(
    &service.db,
    r#"SELECT "username", COALESCE("full_name", '') AS "full_name", "organization_id", "role_id",
              o."name" AS "org_name", r."name" AS "role_name"
         FROM "users" u
         JOIN "organizations" o ON o."id" = u."organization_id"
         JOIN "roles" r ON r."id" = u."role_id"
        WHERE u."id" = $1"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::forbidden("the call names no user of this deployment"))?;
  let administrator = Authz::is_superuser(&user_subject(&service.db, user).await?, &service.db).await?;

  Ok(UserSession {
    inner: tower_sessions::Session::new(
      None,
      std::sync::Arc::new(tower_sessions::MemoryStore::default()),
      None,
    ),
    profile: UserProfile {
      id: user,
      username: row.try_get("", "username")?,
      full_name: row.try_get("", "full_name")?,
      organization: sumida::infra::session::UserOrganization {
        id: row.try_get("", "organization_id")?,
        name: row.try_get("", "org_name")?,
      },
      role: sumida::infra::session::UserRole {
        id: row.try_get("", "role_id")?,
        name: row.try_get("", "role_name")?,
      },
      is_admin: administrator,
      is_authorized: true,
      api_key: None,
      first_seen_at: chrono::Utc::now(),
      last_seen_at: chrono::Utc::now(),
      expiry: None,
    },
    env: UserEnvironment::default(),
    state: UserState::default(),
  })
}

/// One audited supply act: who did it, of what kind, to what subject, and the words beside it.
pub async fn audit<C: ConnectionTrait>(
  db: &C,
  by: i64,
  kind: &str,
  subject: &str,
  detail: &str,
) -> Result<(), Refusal> {
  run(
    db,
    r#"INSERT INTO "supply_audit" ("at", "by", "kind", "subject", "detail") VALUES ($1, $2, $3, $4, $5)"#,
    vec![crate::now_ms().into(), by.into(), kind.into(), subject.into(), detail.into()],
  )
  .await?;

  Ok(())
}

/// Whether a user may change and read what an organisation's `credit_manager` or `manager` may, by sumida's
/// `manage_credit` — a head of a unit above reaches down as `manage` does, and a platform administrator is
/// checked by the caller as one.
pub async fn holds_credit<C: ConnectionTrait>(db: &C, user: i64, unit: i64) -> Result<bool, Refusal> {
  Ok(
    Authz::check("organization", unit as i32, "manage_credit", &user_subject(db, user as i32).await?, db)
      .await
      .is_ok_and(|held| held),
  )
}

/// Whether a user may read and change an organisation's plan, by sumida's `manage_subscription`.
pub async fn holds_subscription<C: ConnectionTrait>(db: &C, user: i64, unit: i64) -> Result<bool, Refusal> {
  Ok(
    Authz::check(
      "organization",
      unit as i32,
      "manage_subscription",
      &user_subject(db, user as i32).await?,
      db,
    )
    .await
    .is_ok_and(|held| held),
  )
}

/// A settled cost written: the run, who paid, which source, what it cost in credits and in US dollars, and
/// the month it falls in.
pub(crate) async fn record_cost<C: ConnectionTrait>(
  db: &C,
  run_id: i64,
  user: i64,
  org: i64,
  source: Source,
  credits: i64,
  cost_micros: i64,
) -> Result<(), Refusal> {
  let now = crate::now_ms();

  run(
    db,
    r#"INSERT INTO "supply_costs"
         ("run", "user_id", "org_id", "source", "credits", "cost_micros", "settled_at", "period")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
    vec![
      run_id.into(),
      user.into(),
      org.into(),
      source.key().into(),
      credits.into(),
      cost_micros.into(),
      now.into(),
      period(now).into(),
    ],
  )
  .await?;

  Ok(())
}
