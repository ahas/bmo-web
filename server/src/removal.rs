//! The platform administrator's permanent delete (docs/accounts.md, 「Deleting an account for good」, 「Deleting a
//! unit or a company」 and 「The removal record」; docs/boundary.md, 「Permanent delete」): what removing an account or
//! a unit with every unit under it would take here, read with nothing changed, the removal itself in one
//! transaction after the secret spaces it takes, and the record each removal leaves. Whether an account may go is
//! decided here; what every other unit keeps is that unit's to remove, and the console hands its results over to be
//! kept.

use std::collections::BTreeMap;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{delete, get};
use axum::{Json, Router};
use bmo_web_client::{
  AccountRemoval, RemovalAsk, RemovalCounts, RemovalPerson, RemovalRecord, Removals, Removed, UnitRef,
  UnitRemoval,
};
use sea_orm::{ConnectionTrait, TransactionTrait, Value};
use sumida::api::authz::Authz;

use crate::ids::shown;
use crate::readers::reader;
use crate::routes::{Answer, Body, user_in};
use crate::secrets::Space;
use crate::units::unit_in;
use crate::users::user_subject;
use crate::{Refusal, Service, all, one, run};

/// The name a removal record keeps this service's own result under, beside the content units'.
pub const OWN_RESULT: &str = "web";

/// The most removal records one read answers.
const RECORDS: i64 = 200;

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/removal", get(account_read))
    .route("/users/{user}", delete(account_delete))
    .route("/units/{unit}/removal", get(unit_read))
    .route("/units/{unit}", delete(unit_delete))
    .route("/removals", get(records))
}

// ---------------------------------------------------------------------------------------------------------
// What a removal takes

/// One table's rows a kind counts and removes: the table and the condition that picks them.
struct Rows {
  table: &'static str,
  picked: String,
}

impl Rows {
  fn new(table: &'static str, picked: impl Into<String>) -> Self {
    Self {
      table,
      picked: picked.into(),
    }
  }
}

/// One kind of row a removal reports, by its kebab-case plural, with the rows of every table it holds, removed in
/// the order they stand.
struct Kind {
  key: &'static str,
  rows: Vec<Rows>,
}

fn kind(key: &'static str, rows: Vec<Rows>) -> Kind {
  Kind { key, rows }
}

/// A user's rows, every table bound to the user as `$1`, in the order they are removed: sumida's user itself last.
fn account_kinds() -> Vec<Kind> {
  // The user's login as it stands, which a few tables key by in place of the id.
  const LOGIN: &str = r#"(SELECT "username" FROM "users" WHERE "id" = $1::bigint)"#;
  let by_user = r#""user_id" = $1::bigint"#;
  // A console table kept by login before it kept the user, read by either.
  let console = format!(r#""user_id" = $1::bigint OR ("user_id" IS NULL AND "user_name" = {LOGIN})"#);
  let personal = r#""owner_kind" = 'personal' AND "owner_id" = $1::bigint"#;

  vec![
    kind("sessions", vec![Rows::new("account_devices", by_user)]),
    kind("remembered-devices", vec![Rows::new("remembered_devices", by_user)]),
    kind("second-factors", vec![Rows::new("second_factors", by_user)]),
    kind("recovery-codes", vec![Rows::new("recovery_codes", by_user)]),
    kind("account-links", vec![Rows::new("account_links", by_user)]),
    kind("email-checks", vec![Rows::new("email_checks", by_user)]),
    kind("senders", vec![Rows::new("user_senders", by_user)]),
    kind(
      "grants",
      vec![Rows::new(
        "relation_tuples",
        r#"("subject_type" = 'user' AND "subject_id" = $1::bigint::text)
             OR ("resource_type" = 'user' AND "resource_id" = $1::bigint::text)"#,
      )],
    ),
    kind("roles", vec![Rows::new("user_roles", by_user)]),
    kind("posts", vec![Rows::new("unit_posts", by_user)]),
    kind("appointments", vec![Rows::new("unit_appointments", by_user)]),
    kind("history", vec![Rows::new("org_history", by_user)]),
    kind(
      "invitations",
      vec![
        Rows::new("user_invites", r#""used_by" = $1::bigint"#),
        Rows::new("user_invitations", by_user),
      ],
    ),
    kind("profiles", vec![Rows::new("user_profiles", by_user)]),
    kind("own-agents", vec![Rows::new("own_agents", by_user)]),
    kind(
      "console-settings",
      vec![
        Rows::new("web_guides", by_user),
        Rows::new("web_presence_hidden", by_user),
        Rows::new("web_languages", console.clone()),
        Rows::new("web_palettes", console.clone()),
        Rows::new("web_themes", console.clone()),
        Rows::new("web_push_devices", console.clone()),
        Rows::new("web_tab_states", console.clone()),
        Rows::new("web_room_reads", console),
        Rows::new("web_users", format!(r#""name" = {LOGIN}"#)),
      ],
    ),
    kind(
      "sign-ins",
      vec![
        Rows::new("user_sign_ins", by_user),
        Rows::new("sign_in_tries", by_user),
        Rows::new("sign_in_locks", format!(r#""login" = lower({LOGIN})"#)),
      ],
    ),
    kind(
      "supply",
      vec![
        Rows::new("supply_reservations", by_user),
        Rows::new("supply_costs", by_user),
        Rows::new("supply_audit", r#""subject" = 'user ' || $1::bigint"#),
      ],
    ),
    kind(
      "memberships",
      vec![
        Rows::new("coupon_redemptions", personal),
        Rows::new("coupon_grants", personal),
        Rows::new("membership_purchases", personal),
        Rows::new("subscriptions", personal),
        Rows::new("credit_wallets", personal),
      ],
    ),
    kind(
      "chain-settings",
      vec![
        Rows::new("chain_rules", r#""who_user" = $1::bigint"#),
        Rows::new("chain_group_members", by_user),
        Rows::new("chain_links", by_user),
      ],
    ),
    kind("departures", vec![Rows::new("user_departures", by_user)]),
    kind("machines", vec![Rows::new("user_nodes", by_user)]),
    kind("keys", vec![Rows::new("api_keys", by_user)]),
    kind(
      "access-records",
      vec![
        Rows::new("access_logs", by_user),
        Rows::new("bans", r#""user_id" = $1::bigint OR "created_by" = $1::bigint"#),
        Rows::new("user_prefs", by_user),
        Rows::new("user_verifications", by_user),
      ],
    ),
    kind("users", vec![Rows::new("users", r#""id" = $1::bigint"#)]),
  ]
}

/// The rows of a subtree of units, its ids written into each condition, in the order they are removed: the units
/// themselves last. A unit outside it that reported to one of them is set back to its parent before.
fn unit_kinds(ids: &[i32]) -> Vec<Kind> {
  let numbers = ids.iter().map(i32::to_string).collect::<Vec<_>>().join(", ");
  let texts = ids.iter().map(|id| format!("'{id}'")).collect::<Vec<_>>().join(", ");
  let audits = ids.iter().map(|id| format!("'org {id}'")).collect::<Vec<_>>().join(", ");
  let groups = format!(r#"(SELECT "id" FROM "chain_groups" WHERE "unit_id" IN ({numbers}))"#);
  let owned = format!(r#""owner_kind" = 'organization' AND "owner_id" IN ({numbers})"#);
  // The relation kinds keyed by a unit's id: sumida's organisation and a unit's org memory.
  let resources =
    format!(r#""resource_type" IN ('organization', 'bmo_org_memory') AND "resource_id" IN ({texts})"#);

  vec![
    kind("posts", vec![Rows::new("unit_posts", format!(r#""unit_id" IN ({numbers})"#))]),
    kind(
      "appointments",
      vec![Rows::new("unit_appointments", format!(r#""unit_id" IN ({numbers})"#))],
    ),
    kind(
      "grants",
      vec![Rows::new(
        "relation_tuples",
        format!(r#"({resources}) OR ("subject_type" = 'organization' AND "subject_id" IN ({texts}))"#),
      )],
    ),
    kind(
      "chain-settings",
      vec![
        Rows::new(
          "chain_rules",
          format!(r#""unit_id" IN ({numbers}) OR "who_unit" IN ({numbers}) OR "who_group" IN {groups}"#),
        ),
        Rows::new("chain_group_members", format!(r#""group_id" IN {groups}"#)),
        Rows::new("chain_groups", format!(r#""unit_id" IN ({numbers})"#)),
        Rows::new("chain_links", format!(r#""unit_id" IN ({numbers})"#)),
      ],
    ),
    kind(
      "supply",
      vec![
        Rows::new("supply_plan_exposures", format!(r#""org_id" IN ({numbers})"#)),
        Rows::new("supply_costs", format!(r#""org_id" IN ({numbers})"#)),
        Rows::new("supply_audit", format!(r#""subject" IN ({audits})"#)),
      ],
    ),
    kind(
      "memberships",
      vec![
        Rows::new("coupon_redemptions", owned.clone()),
        Rows::new("coupon_grants", owned.clone()),
        Rows::new("membership_purchases", owned.clone()),
        Rows::new("subscriptions", owned.clone()),
        Rows::new("credit_wallets", owned),
      ],
    ),
    kind("invitations", vec![Rows::new("user_invites", format!(r#""unit_id" IN ({numbers})"#))]),
    kind(
      "unit-attributes",
      vec![Rows::new("unit_attributes", format!(r#""unit_id" IN ({numbers})"#))],
    ),
    // A company's own lists are keyed by the company, so they match only where a company stands among the ids.
    kind("roles", vec![Rows::new("company_roles", format!(r#""company_id" IN ({numbers})"#))]),
    kind("unit-kinds", vec![Rows::new("unit_kinds", format!(r#""company_id" IN ({numbers})"#))]),
    kind(
      "company-agents",
      vec![Rows::new("company_agents", format!(r#""company_id" IN ({numbers})"#))],
    ),
    kind("units", vec![Rows::new("organizations", format!(r#""id" IN ({numbers})"#))]),
  ]
}

/// How many rows each kind holds now.
async fn counted<C: ConnectionTrait>(
  db: &C,
  kinds: &[Kind],
  values: &[Value],
) -> Result<RemovalCounts, Refusal> {
  let mut counts = RemovalCounts::new();

  for kind in kinds {
    let mut held = 0;

    for rows in &kind.rows {
      let sql = format!(r#"SELECT count(*) AS "held" FROM "{}" WHERE {}"#, rows.table, rows.picked);

      held += match one(db, &sql, values.to_vec()).await? {
        Some(row) => row.try_get::<i64>("", "held")?,
        None => 0,
      };
    }

    counts.insert(kind.key.to_owned(), held);
  }

  Ok(counts)
}

/// Each kind's rows removed, answering how many went.
async fn removed<C: ConnectionTrait>(
  db: &C,
  kinds: &[Kind],
  values: &[Value],
) -> Result<RemovalCounts, Refusal> {
  let mut counts = RemovalCounts::new();

  for kind in kinds {
    let mut gone = 0;

    for rows in &kind.rows {
      let sql = format!(r#"DELETE FROM "{}" WHERE {}"#, rows.table, rows.picked);

      gone += i64::try_from(run(db, &sql, values.to_vec()).await?).unwrap_or(i64::MAX);
    }

    counts.insert(kind.key.to_owned(), gone);
  }

  Ok(counts)
}

// ---------------------------------------------------------------------------------------------------------
// Who removes

/// The platform administrator making the call, twice over: the console's `Owner-Role: administrator` and a user
/// sumida holds the platform administrator now. Anyone else is refused.
async fn remover(service: &Service, headers: &HeaderMap) -> Result<i32, Refusal> {
  let refused = || Refusal::forbidden("a permanent delete is a platform administrator's");

  crate::units::administrator(headers).map_err(|_| refused())?;

  let caller = reader(&service.db, headers).await.map_err(|_| refused())?;

  if !caller.administrator {
    return Err(refused());
  }

  Ok(caller.user)
}

async fn administrator<C: ConnectionTrait>(db: &C, user: i32) -> Result<bool, Refusal> {
  Ok(Authz::is_superuser(&user_subject(db, user).await?, db).await?)
}

/// Every user sumida holds the platform administrator now.
async fn administrators<C: ConnectionTrait>(db: &C) -> Result<Vec<i32>, Refusal> {
  let mut found = vec![];

  for row in all(db, r#"SELECT "id" FROM "users" ORDER BY "id""#, vec![]).await? {
    let user: i32 = row.try_get("", "id")?;

    if administrator(db, user).await? {
      found.push(user);
    }
  }

  Ok(found)
}

fn conflict(code: &'static str, detail: &str) -> Refusal {
  Refusal::new(StatusCode::CONFLICT, detail).coded(code)
}

// ---------------------------------------------------------------------------------------------------------
// An account

/// An account as a removal reads it.
struct Account {
  user: i32,
  login: String,
  full_name: String,
  left: bool,
  administrator: bool,
}

async fn account<C: ConnectionTrait>(db: &C, user: i32) -> Result<Account, Refusal> {
  let row = one(
    db,
    r#"SELECT u."username", COALESCE(u."full_name", '') AS "full_name",
         EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = u."id") AS "left"
       FROM "users" u WHERE u."id" = $1::bigint"#,
    vec![i64::from(user).into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok(Account {
    user,
    login: row.try_get("", "username")?,
    full_name: row.try_get("", "full_name")?,
    left: row.try_get("", "left")?,
    administrator: administrator(db, user).await?,
  })
}

/// The refusal that would stop removing the account now, in its order, or none.
async fn account_refusal<C: ConnectionTrait>(
  db: &C,
  account: &Account,
  caller: i32,
) -> Result<Option<Refusal>, Refusal> {
  if account.user == caller {
    return Ok(Some(conflict("own-account", "an administrator does not delete their own account")));
  }

  let owner: Option<i64> = one(db, r#"SELECT "bmo_administrator"() AS "id""#, vec![])
    .await?
    .map(|row| row.try_get("", "id"))
    .transpose()?;

  if owner == Some(i64::from(account.user)) {
    return Ok(Some(conflict(
      "owner-account",
      "the move's administrator is the anchor the owner's account stands on, and is never deleted",
    )));
  }

  if account.administrator && administrators(db).await? == [account.user] {
    return Ok(Some(conflict("last-administrator", "the last platform administrator is never deleted")));
  }

  if !account.left {
    return Ok(Some(conflict("not-left", "an account is marked left before it is deleted for good")));
  }

  Ok(None)
}

fn secret_files(service: &Service, space: Space) -> Result<i64, Refusal> {
  match &service.secrets {
    Some(store) => store.files_in(space),
    None => Ok(0),
  }
}

/// `GET /users/{user}/removal`: what removing the account would take now, changing nothing.
async fn account_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Answer<AccountRemoval> {
  let caller = remover(&service, &headers).await?;
  let user = user_in(&user)?;
  let account = account(&service.db, user).await?;
  let refusal = account_refusal(&service.db, &account, caller).await?;
  let mut counts = counted(&service.db, &account_kinds(), &[i64::from(user).into()]).await?;

  counts.insert("secrets".to_owned(), secret_files(&service, Space::Person(user))?);

  Ok(Json(AccountRemoval {
    user: shown(user),
    name: account.login,
    full_name: account.full_name,
    left: account.left,
    administrator: account.administrator,
    refusal: refusal.map(|refused| refused.code.to_owned()),
    counts,
  }))
}

/// `DELETE /users/{user}`: the account removed for good, its secret space first and every row after it in one
/// transaction with the record it leaves.
async fn account_delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
  Body(ask): Body<RemovalAsk>,
) -> Answer<Removed> {
  let caller = remover(&service, &headers).await?;
  let user = user_in(&user)?;
  let account = account(&service.db, user).await?;

  if let Some(refused) = account_refusal(&service.db, &account, caller).await? {
    return Err(refused);
  }

  let secrets = match &service.secrets {
    Some(store) => store.remove_space(Space::Person(user))?,
    None => 0,
  };
  let txn = service.db.begin().await?;
  let mut gone = removed(&txn, &account_kinds(), &[i64::from(user).into()]).await?;

  gone.insert("secrets".to_owned(), secrets);

  let record = recorded(
    &txn,
    Record {
      what: "account",
      subject: user,
      login: &account.login,
      name: &account.full_name,
      by: caller,
      units: ask.units,
      own: &gone,
    },
  )
  .await?;

  txn.commit().await?;

  Ok(Json(Removed {
    removed: gone,
    record,
  }))
}

// ---------------------------------------------------------------------------------------------------------
// A unit and every unit under it

/// A unit's subtree as a removal reads it.
struct Subtree {
  unit: i32,
  name: String,
  company: i32,
  /// The subtree, the deepest first.
  units: Vec<UnitRef>,
  people: Vec<RemovalPerson>,
}

impl Subtree {
  fn ids(&self) -> Vec<i32> {
    self.units.iter().filter_map(|unit| i32::try_from(unit.id).ok()).collect()
  }

  /// The refusal that would stop removing the subtree now, or none.
  fn refusal(&self) -> Option<Refusal> {
    if self.people.iter().any(|person| person.administrator) {
      Some(conflict(
        "unit-holds-administrator",
        "a platform administrator stands in the unit or a unit under it",
      ))
    } else if !self.people.is_empty() {
      Some(conflict(
        "unit-holds-people",
        "people stand in the unit or a unit under it, and are deleted for good first",
      ))
    } else {
      None
    }
  }
}

async fn subtree<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Subtree, Refusal> {
  let absent = || Refusal::absent(format!("no unit {unit}"));
  let name: String =
    one(db, r#"SELECT "name" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
      .await?
      .ok_or_else(absent)?
      .try_get("", "name")?;
  let company = crate::units::company_of(db, unit).await?.ok_or_else(absent)?;
  let units = all(
    db,
    r#"SELECT o."id", o."name"
       FROM "org_closure" c JOIN "organizations" o ON o."id" = c."descendant_id"
       WHERE c."ancestor_id" = $1::bigint
       ORDER BY c."depth" DESC, o."id""#,
    vec![unit.into()],
  )
  .await?
  .iter()
  .map(|row| {
    Ok(UnitRef {
      id: i64::from(row.try_get::<i32>("", "id")?),
      name: row.try_get("", "name")?,
    })
  })
  .collect::<Result<Vec<_>, Refusal>>()?;
  let rows = all(
    db,
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name",
         EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = u."id") AS "left"
       FROM "users" u
       WHERE u."organization_id" IN (SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = $1::bigint)
       ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), u."id""#,
    vec![unit.into()],
  )
  .await?;
  let mut people = vec![];

  for row in rows {
    let user: i32 = row.try_get("", "id")?;

    people.push(RemovalPerson {
      user: shown(user),
      name: row.try_get("", "name")?,
      left: row.try_get("", "left")?,
      administrator: administrator(db, user).await?,
    });
  }

  Ok(Subtree {
    unit,
    name,
    company,
    units,
    people,
  })
}

fn unit_secret_files(service: &Service, ids: &[i32]) -> Result<i64, Refusal> {
  ids.iter().map(|id| secret_files(service, Space::Unit(*id))).sum()
}

/// `GET /units/{unit}/removal`: what removing the unit and every unit under it would take now, changing nothing.
async fn unit_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
) -> Answer<UnitRemoval> {
  remover(&service, &headers).await?;
  let tree = subtree(&service.db, unit_in(&unit)?).await?;
  let ids = tree.ids();
  let mut counts = counted(&service.db, &unit_kinds(&ids), &[]).await?;

  counts.insert("secrets".to_owned(), unit_secret_files(&service, &ids)?);

  Ok(Json(UnitRemoval {
    unit: i64::from(tree.unit),
    name: tree.name.clone(),
    company: i64::from(tree.company),
    refusal: tree.refusal().map(|refused| refused.code.to_owned()),
    units: tree.units,
    people: tree.people,
    counts,
  }))
}

/// `DELETE /units/{unit}`: the unit and every unit under it removed for good, their secret spaces first and every
/// row after them in one transaction with the record it leaves.
async fn unit_delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
  Body(ask): Body<RemovalAsk>,
) -> Answer<Removed> {
  let caller = remover(&service, &headers).await?;
  let tree = subtree(&service.db, unit_in(&unit)?).await?;

  if let Some(refused) = tree.refusal() {
    return Err(refused);
  }

  let ids = tree.ids();
  let mut secrets = 0;

  if let Some(store) = &service.secrets {
    for id in &ids {
      secrets += store.remove_space(Space::Unit(*id))?;
    }
  }

  let txn = service.db.begin().await?;
  let numbers = ids.iter().map(i32::to_string).collect::<Vec<_>>().join(", ");

  // A unit outside the subtree that reported to one in it reports to its parent again.
  run(
    &txn,
    &format!(
      r#"UPDATE "unit_attributes" SET "reports_to" = NULL
         WHERE "reports_to" IN ({numbers}) AND "unit_id" NOT IN ({numbers})"#
    ),
    vec![],
  )
  .await?;

  let mut gone = removed(&txn, &unit_kinds(&ids), &[]).await?;

  gone.insert("secrets".to_owned(), secrets);

  let record = recorded(
    &txn,
    Record {
      what: "unit",
      subject: tree.unit,
      login: "",
      name: &tree.name,
      by: caller,
      units: ask.units,
      own: &gone,
    },
  )
  .await?;

  txn.commit().await?;

  Ok(Json(Removed {
    removed: gone,
    record,
  }))
}

// ---------------------------------------------------------------------------------------------------------
// The record

/// What one removal's record keeps.
struct Record<'a> {
  what: &'static str,
  subject: i32,
  login: &'a str,
  name: &'a str,
  by: i32,
  units: BTreeMap<String, RemovalCounts>,
  own: &'a RemovalCounts,
}

/// The record written, answering its id. The content units' results are kept as they were handed over, this
/// service's own under `web` in place of any the caller named so.
async fn recorded<C: ConnectionTrait>(db: &C, record: Record<'_>) -> Result<i64, Refusal> {
  let mut result = record.units;

  result.insert(OWN_RESULT.to_owned(), record.own.clone());

  let result = serde_json::to_string(&result)
    .map_err(|why| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the result as JSON: {why}")))?;
  let row = one(
    db,
    r#"INSERT INTO "removals" ("what", "subject", "login", "name", "removed_by", "removed_at", "result")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING "id""#,
    vec![
      record.what.into(),
      i64::from(record.subject).into(),
      record.login.to_owned().into(),
      record.name.to_owned().into(),
      i64::from(record.by).into(),
      crate::now_ms().into(),
      result.into(),
    ],
  )
  .await?
  .ok_or_else(|| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, "the removal record was not written"))?;

  Ok(row.try_get("", "id")?)
}

/// `GET /removals`: the removal records, the newest first.
async fn records(State(service): State<Service>, headers: HeaderMap) -> Answer<Removals> {
  remover(&service, &headers).await?;

  let rows = all(
    &service.db,
    r#"SELECT "id", "what", "subject", "login", "name", "removed_by", "removed_at", "result"::text AS "result"
       FROM "removals" ORDER BY "removed_at" DESC, "id" DESC LIMIT $1"#,
    vec![RECORDS.into()],
  )
  .await?;
  let removals = rows
    .iter()
    .map(|row| {
      let result: String = row.try_get("", "result")?;
      let by: Option<i64> = row.try_get("", "removed_by")?;

      Ok(RemovalRecord {
        id: row.try_get("", "id")?,
        what: row.try_get("", "what")?,
        subject: row.try_get("", "subject")?,
        login: row.try_get("", "login")?,
        name: row.try_get("", "name")?,
        by: by.and_then(|by| i32::try_from(by).ok()).map(shown),
        at: row.try_get("", "removed_at")?,
        result: serde_json::from_str(&result).unwrap_or_default(),
      })
    })
    .collect::<Result<Vec<_>, Refusal>>()?;

  Ok(Json(Removals { removals }))
}
