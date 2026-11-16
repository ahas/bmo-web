//! The console's sections and the permission each user holds on them (docs/accounts.md, 「Console sections」;
//! docs/boundary.md, 「Users and senders」): a section is one entry of the console's navigation, and its `read`
//! and `write` are two relations of the deployment's rules, checked through sumida's point check like every
//! other relation this service holds. A user's grants are sumida's relation tuples, so no table is the
//! service's own; an administrator sets them whole for one person, and a user made is given the defaults in
//! force before this surface stood.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{OWNER_KEY, OWNER_ROLE, SectionRow, Sections, UserList, UserSummary};
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleFilter, TupleWrite};

use crate::routes::{Answer, Body, user_in};
use crate::users::user_subject;
use crate::{Refusal, Service, one, run};

/// The kind of the deployment's rules a console section is.
pub const KIND: &str = "bmo_section";

/// The five parts of agent management, each its own permission: the supervisors, the roles, the repositories,
/// the registered models and the model files.
pub const AGENT_SECTIONS: [&str; 5] = ["supervisors", "roles", "repositories", "models", "model-files"];

/// The sections the console serves, in the order its navigation stands them: the console's own screens and the
/// screen the brain brings, with agent management's five parts where its screen stands. `rooms` is the list of
/// the reader's rooms and `account` the reader's own account, neither of which stands in the navigation's flat
/// group.
pub const SECTIONS: [&str; 19] = [
  "live",
  "mail",
  "siren",
  "db",
  "files",
  "artifact",
  "documents",
  "code",
  "supervisors",
  "roles",
  "repositories",
  "models",
  "model-files",
  "research",
  "monitor",
  "remote",
  "brain",
  "rooms",
  "account",
];

/// What a reader may use today, and so what a user made without an administrator's word is given: their rooms,
/// their own account, and the screens units bring that a member may open. A screen whose manifest names the
/// administrator alone stays closed to them by that manifest, whatever its section says.
pub const DEFAULT_READ: [&str; 8] =
  ["mail", "files", "artifact", "code", "remote", "brain", "rooms", "account"];
/// The default sections a reader may write.
pub const DEFAULT_WRITE: [&str; 2] = ["account", "rooms"];

/// The settings key the one-time default seeding is marked under.
const SEEDED: &str = "sections_seeded_at";

/// The settings key the one-time grant of the rooms' write to users given the earlier defaults is marked under.
const ROOMS_WRITE_SEEDED: &str = "sections_rooms_write_seeded_at";

/// The name a default or an administrator's write is recorded under in the tuple's `created_by`.
const DEFAULTS: &str = "section-defaults";
const SETTINGS: &str = "section-settings";

/// Whether a section id is one the console may name: lower case letters, digits, `-`, `_` and `/`, beginning
/// with a letter or a digit, at most 128 bytes.
pub fn section_id_ok(section: &str) -> bool {
  !section.is_empty()
    && section.len() <= 128
    && section
      .bytes()
      .next()
      .is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit())
    && section
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_' | b'/'))
}

/// The canonical section list with every id a user holds a grant on beyond it, in canonical order.
fn sections_with(granted: &[String]) -> Vec<String> {
  let mut listed: Vec<String> = SECTIONS.iter().map(|section| (*section).to_owned()).collect();

  for section in granted {
    if !listed.contains(section) {
      listed.push(section.clone());
    }
  }

  listed
}

/// The sections a user holds a grant on, from the tuples written for them.
async fn granted<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<String>, Refusal> {
  let subject = SubjectKey::user(user).key();
  let rows = crate::all(
    db,
    r#"SELECT DISTINCT "resource_id" FROM "relation_tuples"
       WHERE "resource_type" = $1 AND "subject_key" = $2
         AND (("expires_at" IS NULL OR "expires_at" > now()))
       ORDER BY "resource_id""#,
    vec![KIND.into(), subject.into()],
  )
  .await?;

  rows.iter().map(|row| Ok(row.try_get::<String>("", "resource_id")?)).collect()
}

/// One user's sections, each with whether the user may read and write it, evaluated through the deployment's
/// rules: the administrator passes every section.
pub async fn of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<SectionRow>, Refusal> {
  let stands = one(db, r#"SELECT 1 AS "one" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .is_some();

  if !stands {
    return Err(Refusal::absent(format!("no user {user}")));
  }

  let subject = user_subject(db, user).await?;
  let held = granted(db, user).await?;
  let mut rows = Vec::new();

  for section in sections_with(&held) {
    rows.push(SectionRow {
      read: Authz::check(KIND, section.as_str(), "may_read", &subject, db).await?,
      write: Authz::check(KIND, section.as_str(), "may_write", &subject, db).await?,
      section,
    });
  }

  Ok(rows)
}

/// A user given the defaults in force: their rooms and their account read and written.
pub async fn seed_defaults<C: ConnectionTrait>(db: &C, user: i32, granter: &str) -> Result<(), Refusal> {
  let subject = SubjectKey::user(user);

  for section in DEFAULT_READ {
    Authz::write_unchecked(TupleWrite::new(KIND, section, "read", subject.clone()), granter, db).await?;
  }

  for section in DEFAULT_WRITE {
    Authz::write_unchecked(TupleWrite::new(KIND, section, "write", subject.clone()), granter, db).await?;
  }

  Ok(())
}

/// The default grants written once for the users who stood before this surface did: a user holding no section
/// tuple at all is given the defaults, and the seeding is marked so it is never run again. A user whose
/// administrator has since taken every section away keeps none.
pub async fn backfill<C: ConnectionTrait + TransactionTrait>(db: &C) -> Result<(), Refusal> {
  if one(db, r#"SELECT 1 AS "held" FROM "settings" WHERE "key" = $1"#, vec![SEEDED.into()])
    .await?
    .is_some()
  {
    return Ok(());
  }

  let txn = db.begin().await?;

  let users = crate::all(
    &txn,
    r#"SELECT u."id" FROM "users" u
       WHERE NOT EXISTS (
         SELECT 1 FROM "relation_tuples" t
         WHERE t."resource_type" = $1 AND t."subject_key" = 'user:' || u."id"
       )
       ORDER BY u."id""#,
    vec![KIND.into()],
  )
  .await?;

  // A database with no user yet keeps no mark: the users made after it are given the defaults as they are made,
  // and a store still empty of them is one an import may write.
  if users.is_empty() {
    txn.rollback().await?;

    return Ok(());
  }

  for row in &users {
    seed_defaults(&txn, row.try_get("", "id")?, DEFAULTS).await?;
  }

  // Two starts against one database may seed together; the mark is written once and the seeding is idempotent.
  run(
    &txn,
    r#"INSERT INTO "settings" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING"#,
    vec![SEEDED.into(), crate::now_ms().to_string().into()],
  )
  .await?;
  txn.commit().await?;

  Ok(())
}

/// The settings key the one-time move of agent management's old single grant is marked under.
const AGENTS_SPLIT: &str = "sections_agents_split_at";

/// Agent management's old one section moved to its five parts: a grant on `agents` is written on every part it
/// opened, so a reader an administrator had opened agent management for keeps it whole, and the old grant is
/// taken away. Run once, against a deployment that holds a user.
pub async fn split_agents<C: ConnectionTrait + TransactionTrait>(db: &C) -> Result<(), Refusal> {
  if one(db, r#"SELECT 1 AS "held" FROM "settings" WHERE "key" = $1"#, vec![AGENTS_SPLIT.into()])
    .await?
    .is_some()
  {
    return Ok(());
  }

  let txn = db.begin().await?;

  if one(&txn, r#"SELECT 1 AS "one" FROM "users" LIMIT 1"#, vec![]).await?.is_none() {
    txn.rollback().await?;

    return Ok(());
  }

  let tuples = crate::all(
    &txn,
    r#"SELECT "subject_key", "relation" FROM "relation_tuples"
       WHERE "resource_type" = $1 AND "resource_id" = 'agents'
         AND "relation" IN ('read', 'write')
         AND ("expires_at" IS NULL OR "expires_at" > now())"#,
    vec![KIND.into()],
  )
  .await?;

  for row in &tuples {
    let key: String = row.try_get("", "subject_key")?;
    let relation: String = row.try_get("", "relation")?;
    let Some(user) = key.strip_prefix("user:").and_then(|id| id.parse::<i32>().ok()) else {
      continue;
    };

    for section in AGENT_SECTIONS {
      Authz::write_unchecked(
        TupleWrite::new(KIND, section, relation.as_str(), SubjectKey::user(user)),
        DEFAULTS,
        &txn,
      )
      .await?;
    }
  }

  Authz::revoke_unchecked(TupleFilter::object(KIND, "agents"), &txn).await?;
  run(
    &txn,
    r#"INSERT INTO "settings" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING"#,
    vec![AGENTS_SPLIT.into(), crate::now_ms().to_string().into()],
  )
  .await?;
  txn.commit().await?;

  Ok(())
}

/// A user's permissions written whole: every section named is given the read and the write it asks for, and
/// every section not named is taken away. Written in one transaction, so a failure leaves the person with
/// what they had.
pub async fn set<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  user: i32,
  asked: &[SectionRow],
) -> Result<Vec<SectionRow>, Refusal> {
  one(db, r#"SELECT 1 AS "one" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  let mut wanted: Vec<SectionRow> = Vec::new();

  for row in asked {
    if !section_id_ok(&row.section) {
      return Err(Refusal::bad(format!("`{}` is no section", row.section)));
    }

    if wanted.iter().any(|held| held.section == row.section) {
      return Err(Refusal::bad(format!("`{}` is named twice", row.section)));
    }

    // A write is also a read: nobody changes what they may not see.
    wanted.push(SectionRow {
      section: row.section.clone(),
      read: row.read || row.write,
      write: row.write,
    });
  }

  let txn = db.begin().await?;
  let subject = SubjectKey::user(user);
  let held = granted(&txn, user).await?;
  let mut touched = sections_with(&held);

  for row in &wanted {
    if !touched.contains(&row.section) {
      touched.push(row.section.clone());
    }
  }

  for section in &touched {
    Authz::revoke_unchecked(
      TupleFilter::object(KIND, section)
        .relations(&["read", "write"])
        .subject(subject.clone()),
      &txn,
    )
    .await?;
  }

  for row in &wanted {
    for (relation, wanted) in [("read", row.read), ("write", row.write)] {
      if wanted {
        Authz::write_unchecked(
          TupleWrite::new(KIND, &row.section, relation, subject.clone()),
          SETTINGS,
          &txn,
        )
        .await?;
      }
    }
  }

  txn.commit().await?;

  of(db, user).await
}

/// The caller the console names: its user and its role.
fn caller(headers: &HeaderMap) -> (Option<i32>, Option<String>) {
  let role = headers.get(OWNER_ROLE).and_then(|value| value.to_str().ok()).map(str::to_owned);
  let key = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok());

  (key, role)
}

fn administrator(headers: &HeaderMap) -> bool {
  caller(headers).1.as_deref() == Some("administrator")
}

/// Every user, with their login, the person's name and whether they are the platform administrator, for the
/// administrator alone.
async fn users(State(service): State<Service>, headers: HeaderMap) -> Answer<UserList> {
  if !administrator(&headers) {
    return Err(Refusal::forbidden("the users are the administrator's"));
  }

  let rows = crate::all(
    &service.db,
    r#"SELECT "id", "username", COALESCE("full_name", '') AS "full_name" FROM "users" ORDER BY "id""#,
    vec![],
  )
  .await?;
  let mut listed = Vec::new();

  for row in &rows {
    let user: i32 = row.try_get("", "id")?;
    listed.push(UserSummary {
      user: crate::ids::shown(user),
      name: row.try_get("", "username")?,
      full_name: row.try_get("", "full_name")?,
      administrator: Authz::is_superuser(&user_subject(&service.db, user).await?, &service.db).await?,
    });
  }

  Ok(Json(UserList { users: listed }))
}

/// One user's sections: the account's holder's or an administrator's.
async fn read(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<Sections> {
  let user = user_in(&user)?;
  let (key, _) = caller(&headers);

  if !administrator(&headers) && key != Some(user) {
    return Err(Refusal::forbidden(
      "a user's sections are their own or an administrator's: the call names neither",
    ));
  }

  Ok(Json(Sections {
    sections: of(&service.db, user).await?,
  }))
}

/// One user's sections written whole, by an administrator alone.
async fn write(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(asked): Body<Sections>,
) -> Answer<Sections> {
  if !administrator(&headers) {
    return Err(Refusal::forbidden("the sections are an administrator's to set"));
  }

  let user = user_in(&user)?;

  Ok(Json(Sections {
    sections: set(&service.db, user, &asked.sections).await?,
  }))
}

/// The users' and sections' routes, mounted with the service's own.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users", get(users))
    .route("/users/{user}/sections", get(read).put(write))
}

/// The rooms' write given once to the users the earlier defaults gave the rooms' read alone: each user whose rooms
/// read was written as a default, by whichever road made the user, and who holds no rooms write. What an administrator set by hand stays as set, and the
/// grant is marked so it is never run again.
pub async fn backfill_rooms_write<C: ConnectionTrait + TransactionTrait>(db: &C) -> Result<(), Refusal> {
  if one(
    db,
    r#"SELECT 1 AS "held" FROM "settings" WHERE "key" = $1"#,
    vec![ROOMS_WRITE_SEEDED.into()],
  )
  .await?
  .is_some()
  {
    return Ok(());
  }

  let txn = db.begin().await?;
  let users = crate::all(
    &txn,
    r#"SELECT u."id" FROM "users" u
       WHERE EXISTS (
         SELECT 1 FROM "relation_tuples" t
         WHERE t."resource_type" = $1 AND t."resource_id" = 'rooms' AND t."relation" = 'read'
           AND t."subject_key" = 'user:' || u."id" AND t."created_by" <> $2
       )
       AND NOT EXISTS (
         SELECT 1 FROM "relation_tuples" t
         WHERE t."resource_type" = $1 AND t."resource_id" = 'rooms' AND t."relation" = 'write'
           AND t."subject_key" = 'user:' || u."id"
       )
       ORDER BY u."id""#,
    vec![KIND.into(), SETTINGS.into()],
  )
  .await?;

  // A database with no user yet keeps no mark, as the defaults' own seeding keeps none: the users made after it
  // are given the write as they are made, and a store still empty of them is one an import may write.
  if one(&txn, r#"SELECT 1 AS "held" FROM "users" LIMIT 1"#, vec![]).await?.is_none() {
    txn.rollback().await?;

    return Ok(());
  }

  for row in &users {
    let subject = SubjectKey::user(row.try_get("", "id")?);

    Authz::write_unchecked(TupleWrite::new(KIND, "rooms", "write", subject), DEFAULTS, &txn).await?;
  }

  run(
    &txn,
    r#"INSERT INTO "settings" ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING"#,
    vec![ROOMS_WRITE_SEEDED.into(), crate::now_ms().to_string().into()],
  )
  .await?;
  txn.commit().await?;

  Ok(())
}
