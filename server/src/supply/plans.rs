//! An organisation's plans (docs/accounts.md, 「An organisation's plans」): the organisation-scope plans a
//! platform administrator shows each unit, one row each in `supply_plan_exposures`, and the one the unit runs
//! on — a live organisation subscription of sumida's, made by sumida's own subscribe with no billing key. The
//! applied choice is kept on its exposure row, so the service's hourly membership pass subscribes a unit to the
//! same plan again once the period of the subscription it applied has ended.

use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::service::membership::subscription::SubscriptionService;
use sumida::api::service::membership::subscription::dto::CreateSubscription;
use sumida::entity::membership::OwnerKind;

use super::{audit, session};
use crate::{Refusal, Service, all, one, run};

/// The class of the advisory lock each unit's plans are changed under, the unit's id the second key: a pair of
/// keys never meets sumida's maintenance lock, which is a single one.
const UNIT_LOCK: i32 = 0x5350_4C4E;

/// A transaction holding the unit's plans lock until it ends, committed or not: an exposure, an apply and a
/// renewal of one unit each run inside one, so none sees another half done.
async fn unit_locked(
  service_db: &sea_orm::DatabaseConnection,
  unit: i64,
) -> Result<sea_orm::DatabaseTransaction, Refusal> {
  let txn = service_db.begin().await?;

  run(
    &txn,
    "SELECT pg_advisory_xact_lock($1::int4, $2::int4)",
    vec![UNIT_LOCK.into(), (unit as i32).into()],
  )
  .await?;

  Ok(txn)
}

/// Whether a subscription row is in force now: active within its period, or past due within its grace.
const LIVE: &str = r#"((s."status" = 'active' AND s."current_period_end" > now())
  OR (s."status" = 'past-due' AND s."grace_ends_at" IS NOT NULL AND s."grace_ends_at" > now()))"#;

/// A unit's live subscription, read with its plan: what the unit's plan card and its applied plan show.
pub struct LiveSubscription {
  pub plan: i64,
  /// The period's start and end, in epoch milliseconds.
  pub since: i64,
  pub period_end: i64,
  pub name: String,
  pub price: i64,
  pub period: String,
  pub included_credits: Option<i64>,
  pub credits_usable: bool,
}

impl LiveSubscription {
  /// The plan the subscription stands on, as a unit's plan card and its applied plan show it, whether or not the
  /// plan is still exposed to the unit or still stands.
  pub fn card(self) -> bmo_web_client::SupplyPlanCard {
    bmo_web_client::SupplyPlanCard {
      name: self.name,
      price: self.price,
      scope: "organisation".to_owned(),
      period: self.period,
      included_credits: self.included_credits,
      credits_usable: self.credits_usable,
    }
  }
}

/// The unit's own live subscription, newest period end first. A retired plan's stands on its snapshot until
/// its period ends.
pub async fn live<C: ConnectionTrait>(db: &C, unit: i64) -> Result<Option<LiveSubscription>, Refusal> {
  let Some(row) = one(
    db,
    &format!(
      r#"SELECT s."plan_id", p."name", p."price", p."billing_interval",
                (EXTRACT(EPOCH FROM s."current_period_start") * 1000)::bigint AS "since",
                (EXTRACT(EPOCH FROM s."current_period_end") * 1000)::bigint AS "period_end",
                (s."amount_quotas" ->> 'supply')::bigint AS "quota",
                (a."credit_cost" IS NOT NULL) AS "priced"
           FROM "subscriptions" s
           JOIN "membership_plans" p ON p."id" = s."plan_id"
           LEFT JOIN "plan_actions" a ON a."plan_id" = s."plan_id" AND a."action" = 'supply'
          WHERE s."owner_kind" = 'organization' AND s."owner_id" = $1 AND {LIVE}
          ORDER BY s."current_period_end" DESC LIMIT 1"#
    ),
    vec![(unit as i32).into()],
  )
  .await?
  else {
    return Ok(None);
  };

  Ok(Some(LiveSubscription {
    plan: i64::from(row.try_get::<i32>("", "plan_id")?),
    since: row.try_get("", "since")?,
    period_end: row.try_get("", "period_end")?,
    name: row.try_get("", "name")?,
    price: row.try_get("", "price")?,
    period: row
      .try_get::<Option<String>>("", "billing_interval")?
      .unwrap_or_else(|| "month".to_owned()),
    included_credits: row.try_get("", "quota")?,
    credits_usable: row.try_get::<Option<bool>>("", "priced")?.unwrap_or(false),
  }))
}

/// The plans a unit is shown, newest first; a retired plan's exposure, which its retirement takes away right
/// after, is never among them.
pub async fn exposed<C: ConnectionTrait>(db: &C, unit: i64) -> Result<Vec<i64>, Refusal> {
  let rows = all(
    db,
    r#"SELECT e."plan_id" FROM "supply_plan_exposures" e
         JOIN "membership_plans" p ON p."id" = e."plan_id"
        WHERE e."org_id" = $1 AND p."deleted_at" IS NULL
        ORDER BY e."plan_id" DESC"#,
    vec![unit.into()],
  )
  .await?;

  rows.iter().map(|row| Ok(row.try_get::<i64>("", "plan_id")?)).collect()
}

/// Every plan a unit is shown, written whole by a platform administrator. Each is an organisation-scope plan
/// that stands, and the applied plan is never left out. The write holds the unit's plans lock.
pub async fn set_exposed(
  db: &sea_orm::DatabaseConnection,
  actor: i64,
  unit: i64,
  plans: &[i64],
) -> Result<(), Refusal> {
  let mut plans = plans.to_vec();

  plans.sort_unstable();
  plans.dedup();
  for plan in &plans {
    let scope = one(
      db,
      r#"SELECT "scope" FROM "membership_plans" WHERE "id" = $1 AND "deleted_at" IS NULL"#,
      vec![(*plan as i32).into()],
    )
    .await?
    .ok_or_else(|| Refusal::absent(format!("no plan {plan} stands")).coded("unknown-plan"))?
    .try_get::<String>("", "scope")?;

    if scope != "organization" {
      return Err(
        Refusal::new(
          axum::http::StatusCode::UNPROCESSABLE_ENTITY,
          format!("plan {plan} is no organisation plan"),
        )
        .coded("plan-scope"),
      );
    }
  }

  let txn = unit_locked(db, unit).await?;
  let rows = all(
    &txn,
    r#"SELECT "plan_id", "applied" FROM "supply_plan_exposures" WHERE "org_id" = $1"#,
    vec![unit.into()],
  )
  .await?;
  let mut standing = Vec::with_capacity(rows.len());

  for row in &rows {
    let plan: i64 = row.try_get("", "plan_id")?;

    if row.try_get::<bool>("", "applied")? && !plans.contains(&plan) {
      return Err(applied_left_out(plan));
    }
    standing.push(plan);
  }
  for plan in standing.iter().filter(|plan| !plans.contains(plan)) {
    run(
      &txn,
      r#"DELETE FROM "supply_plan_exposures" WHERE "org_id" = $1 AND "plan_id" = $2"#,
      vec![unit.into(), (*plan).into()],
    )
    .await?;
  }
  for plan in plans.iter().filter(|plan| !standing.contains(plan)) {
    run(
      &txn,
      r#"INSERT INTO "supply_plan_exposures" ("org_id", "plan_id", "set_by", "set_at")
         VALUES ($1, $2, $3, $4)"#,
      vec![unit.into(), (*plan).into(), actor.into(), crate::now_ms().into()],
    )
    .await?;
  }
  audit(&txn, actor, "plan", &unit_subject(unit), &format!("exposed {}", ids(&plans))).await?;
  txn.commit().await?;

  Ok(())
}

fn applied_left_out(plan: i64) -> Refusal {
  Refusal::new(
    axum::http::StatusCode::CONFLICT,
    format!("plan {plan} is the one the unit runs on and stays shown to it"),
  )
  .coded("plan-applied")
}

fn not_exposed(plan: i64) -> Refusal {
  Refusal::new(axum::http::StatusCode::CONFLICT, format!("plan {plan} is not exposed to the unit"))
    .coded("plan-not-exposed")
}

/// The plan a unit runs on set to one of its exposed plans, or to none, the whole act under the unit's plans
/// lock. The plan chosen is subscribed first, through sumida's own subscribe for the unit with no billing key
/// and no renewal of sumida's, a live subscription on it kept where one stands; only then is every other
/// subscription of the unit that still stands cancelled and the applied mark moved, so a subscribe refused
/// leaves the unit as it stood.
pub async fn apply(service: &Service, actor: i32, unit: i64, plan: Option<i64>) -> Result<(), Refusal> {
  let txn = unit_locked(&service.db, unit).await?;

  if let Some(plan) = plan
    && !exposed(&txn, unit).await?.contains(&plan)
  {
    return Err(not_exposed(plan));
  }

  let subscriptions = SubscriptionService::new(service.clone(), session(service, actor).await?);
  let rows = standing(&txn, unit, plan).await?;
  let kept = rows.iter().find(|row| row.on_plan && row.live).map(|row| row.id);

  if let Some(plan) = plan
    && kept.is_none()
  {
    resubscribe(service, &subscriptions, &rows, unit, plan).await?;
  }
  for row in &rows {
    if !row.on_plan || kept.is_some_and(|kept| kept != row.id) {
      subscriptions.cancel(row.id, false).await?;
    }
  }

  // The choice let go before the next is taken: the unit holds one applied row at every moment, which its
  // unique index checks row by row.
  run(
    &txn,
    r#"UPDATE "supply_plan_exposures" SET "applied" = false WHERE "org_id" = $1 AND "applied""#,
    vec![unit.into()],
  )
  .await?;
  run(
    &txn,
    r#"UPDATE "supply_plan_exposures" SET "applied" = true WHERE "org_id" = $1 AND "plan_id" = $2"#,
    vec![unit.into(), plan.into()],
  )
  .await?;
  audit(
    &txn,
    i64::from(actor),
    "plan",
    &unit_subject(unit),
    &plan.map_or("applied none".to_owned(), |plan| format!("applied plan {plan}")),
  )
  .await?;
  txn.commit().await?;

  Ok(())
}

// Every subscription of the unit that still stands in sumida, each marked whether it is on `plan`.
async fn standing<C: ConnectionTrait>(
  db: &C,
  unit: i64,
  plan: Option<i64>,
) -> Result<Vec<Standing>, Refusal> {
  let rows = all(
    db,
    &format!(
      r#"SELECT s."id", s."plan_id", {LIVE} AS "live" FROM "subscriptions" s
          WHERE s."owner_kind" = 'organization' AND s."owner_id" = $1 AND s."status" IN ('active', 'past-due')"#
    ),
    vec![(unit as i32).into()],
  )
  .await?;
  let mut out = Vec::with_capacity(rows.len());

  for row in &rows {
    out.push(Standing {
      id: row.try_get("", "id")?,
      on_plan: Some(i64::from(row.try_get::<i32>("", "plan_id")?)) == plan,
      live: row.try_get("", "live")?,
    });
  }

  Ok(out)
}

// The unit subscribed to the plan afresh. A subscription on the plan whose period ended unseen still reads
// active to sumida, which would refuse a second one on the same plan: it is in force no longer, and goes first.
async fn resubscribe(
  service: &Service,
  subscriptions: &SubscriptionService<Service>,
  rows: &[Standing],
  unit: i64,
  plan: i64,
) -> Result<(), Refusal> {
  for row in rows.iter().filter(|row| row.on_plan && !row.live) {
    subscriptions.cancel(row.id, false).await?;
  }

  subscribe(service, subscriptions, unit, plan).await
}

// One subscription of the unit that still stands in sumida, active or past due.
struct Standing {
  id: i32,
  /// Whether it is on the plan the apply chose.
  on_plan: bool,
  /// Whether it is in force now.
  live: bool,
}

// The unit subscribed to a plan through sumida. The key names the newest subscription the unit had before, so
// the same apply or renewal asked twice makes one subscription, and a later one makes its own.
async fn subscribe(
  service: &Service,
  subscriptions: &SubscriptionService<Service>,
  unit: i64,
  plan: i64,
) -> Result<(), Refusal> {
  let code: String = one(
    &service.db,
    r#"SELECT "code" FROM "membership_plans" WHERE "id" = $1"#,
    vec![(plan as i32).into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no plan {plan} stands")).coded("unknown-plan"))?
  .try_get("", "code")?;
  let newest: i32 = one(
    &service.db,
    r#"SELECT COALESCE(MAX("id"), 0) AS "newest" FROM "subscriptions"
        WHERE "owner_kind" = 'organization' AND "owner_id" = $1"#,
    vec![(unit as i32).into()],
  )
  .await?
  .map(|row| row.try_get("", "newest"))
  .transpose()?
  .unwrap_or(0);

  subscriptions
    .subscribe(CreateSubscription {
      plan_code: code,
      owner_kind: OwnerKind::Organization,
      owner_id: Some(unit as i32),
      idempotency_key: Some(format!("supply-plan:{unit}:{plan}:after:{newest}")),
      auto_renew: false,
      billing_key: None,
      coupon_code: None,
      coupon_codes: None,
    })
    .await?;

  Ok(())
}

/// A retired plan's exposures taken away, its applied choice with them.
pub async fn forget<C: ConnectionTrait>(db: &C, plan: i64) -> Result<(), Refusal> {
  run(db, r#"DELETE FROM "supply_plan_exposures" WHERE "plan_id" = $1"#, vec![plan.into()]).await?;

  Ok(())
}

/// What one renewal pass did: the units subscribed again, and why each one that was not failed.
#[derive(Debug, Default)]
pub struct Renewal {
  pub renewed: usize,
  pub failed: Vec<String>,
}

/// The service's hourly membership pass: sumida's own maintenance — expiry, renewal and notices — and then
/// every applied plan whose subscription is no longer live subscribed again.
pub async fn membership_pass(service: &Service) -> Result<Renewal, Refusal> {
  sumida::api::service::membership::maintenance::run_once::<Service>(&service.db).await;

  renew_applied(service).await
}

/// The key of sumida's membership maintenance lock, which sumida keeps to itself: the renewal takes the same
/// one after sumida's own pass let it go, so of several instances one renews at a time, and the next finds
/// nothing left due.
const MAINTENANCE_LOCK: i64 = 0x5346_4D49_4D42_4C4B;

/// Every unit whose applied plan has no live subscription subscribed to it again, under the move's
/// administrator, the user the service's own acts stand under (docs/accounts.md, 「The platform
/// administrators」), and under sumida's maintenance lock: where another instance holds it, this one renews
/// nothing.
pub async fn renew_applied(service: &Service) -> Result<Renewal, Refusal> {
  let guard = service.db.begin().await?;
  let locked = one(
    &guard,
    "SELECT pg_try_advisory_xact_lock($1) AS \"locked\"",
    vec![MAINTENANCE_LOCK.into()],
  )
  .await?
  .map(|row| row.try_get::<bool>("", "locked"))
  .transpose()?
  .unwrap_or(false);

  if !locked {
    guard.rollback().await?;

    return Ok(Renewal::default());
  }

  let renewal = renew_due(service).await;

  guard.commit().await?;
  renewal
}

// The renewal itself, while the maintenance lock is held: each unit due renewed under its own plans lock, read
// again under it, so an apply or an exposure made meanwhile is seen whole.
async fn renew_due(service: &Service) -> Result<Renewal, Refusal> {
  let due = all(
    &service.db,
    &format!(r#"SELECT e."org_id", e."plan_id" FROM "supply_plan_exposures" e {}"#, due()),
    vec![],
  )
  .await?;
  let mut renewal = Renewal::default();

  if due.is_empty() {
    return Ok(renewal);
  }

  let administrator: i64 = one(&service.db, r#"SELECT "bmo_administrator"() AS "id""#, vec![])
    .await?
    .and_then(|row| row.try_get::<Option<i64>>("", "id").ok().flatten())
    .ok_or_else(|| {
      Refusal::forbidden("no move's administrator stands for the service to renew a plan under")
    })?;
  let subscriptions =
    SubscriptionService::new(service.clone(), session(service, administrator as i32).await?);

  for row in &due {
    let unit: i64 = row.try_get("", "org_id")?;
    let plan: i64 = row.try_get("", "plan_id")?;

    match renew_one(service, &subscriptions, administrator, unit, plan).await {
      Ok(true) => renewal.renewed += 1,
      Ok(false) => {}
      Err(why) => renewal.failed.push(format!("plan {plan} of unit {unit} was not renewed: {why}")),
    }
  }

  Ok(renewal)
}

/// Which applied plans are due: marked applied, and with no subscription in force on them.
fn due() -> String {
  format!(
    r#"WHERE e."applied"
         AND NOT EXISTS (SELECT 1 FROM "subscriptions" s
                          WHERE s."owner_kind" = 'organization' AND s."owner_id" = e."org_id"
                            AND s."plan_id" = e."plan_id" AND {LIVE})"#
  )
}

// One unit's applied plan subscribed again, where it is still due under the unit's lock: whether it was.
async fn renew_one(
  service: &Service,
  subscriptions: &SubscriptionService<Service>,
  administrator: i64,
  unit: i64,
  plan: i64,
) -> Result<bool, Refusal> {
  let txn = unit_locked(&service.db, unit).await?;
  let still_due = one(
    &txn,
    &format!(
      r#"SELECT 1 AS "due" FROM "supply_plan_exposures" e {} AND e."org_id" = $1 AND e."plan_id" = $2"#,
      due()
    ),
    vec![unit.into(), plan.into()],
  )
  .await?
  .is_some();

  if !still_due {
    return Ok(false);
  }

  let rows = standing(&txn, unit, Some(plan)).await?;

  resubscribe(service, subscriptions, &rows, unit, plan).await?;
  audit(&txn, administrator, "plan", &unit_subject(unit), &format!("renewed plan {plan}")).await?;
  txn.commit().await?;

  Ok(true)
}

fn unit_subject(unit: i64) -> String {
  format!("org {unit}")
}

fn ids(plans: &[i64]) -> String {
  if plans.is_empty() {
    return "none".to_owned();
  }

  plans.iter().map(i64::to_string).collect::<Vec<_>>().join(",")
}
