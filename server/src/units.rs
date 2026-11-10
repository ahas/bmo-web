//! Companies and organisation units (docs/accounts.md, 「Companies and organisation units」; docs/boundary.md,
//! 「Organisation units」): sumida's organisations read as a tree whose tops are the companies, the unit a user
//! stands in, and whether a user heads a unit, which is sumida's `manage` on it and so reaches every unit below
//! a head's own.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use bmo_web_client::{CheckAnswer, Unit, UnitCheckAsk, UnitRef, UserUnit};
use sea_orm::ConnectionTrait;
use sumida::api::authz::Authz;

use crate::ids::{parsed, shown};
use crate::routes::{Answer, Body, user_in};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one};

/// The kind a unit is in sumida's rules, and the permission that says its holder heads it.
pub const UNIT: &str = "organization";
const HEADS: &str = "manage";
/// The relation a head is granted under.
const HEAD_GRANT: &str = "manager";

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/unit", get(user_unit_route))
    .route("/units/{unit}", get(unit_route))
    .route("/checks/unit", post(unit_check))
}

/// The units from the company at the top of a unit's branch down to the unit itself; empty where there is no
/// such unit.
pub async fn path_of<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<UnitRef>, Refusal> {
  let rows = all(
    db,
    r#"SELECT o."id", o."name"
       FROM "org_closure" c
       JOIN "organizations" o ON o."id" = c."ancestor_id"
       WHERE c."descendant_id" = $1
       ORDER BY c."depth" DESC"#,
    vec![unit.into()],
  )
  .await?;

  rows
    .iter()
    .map(|row| {
      Ok(UnitRef {
        id: i64::from(row.try_get::<i32>("", "id")?),
        name: row.try_get("", "name")?,
      })
    })
    .collect()
}

/// The company a unit belongs to: the unit at the top of its branch, itself where it has no parent.
pub async fn company_of<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Option<i32>, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT c."ancestor_id"
         FROM "org_closure" c
         WHERE c."descendant_id" = $1
         ORDER BY c."depth" DESC
         LIMIT 1"#,
      vec![unit.into()],
    )
    .await?
    .map(|row| row.try_get::<i32>("", "ancestor_id"))
    .transpose()?,
  )
}

/// The unit a user stands in, where the user stands.
pub async fn unit_of_user<C: ConnectionTrait>(db: &C, user: i32) -> Result<Option<i32>, Refusal> {
  Ok(
    one(db, r#"SELECT "organization_id" FROM "users" WHERE "id" = $1"#, vec![user.into()])
      .await?
      .map(|row| row.try_get::<i32>("", "organization_id"))
      .transpose()?,
  )
}

fn split(path: Vec<UnitRef>, unit: i32) -> Result<(UnitRef, UnitRef, Vec<UnitRef>), Refusal> {
  let company = path.first().cloned();
  let own = path.last().cloned();

  match (company, own) {
    (Some(company), Some(own)) => Ok((own, company, path)),
    _ => Err(Refusal::absent(format!("no unit {unit}"))),
  }
}

/// The unit a user stands in, its company and the path between them.
pub async fn user_unit<C: ConnectionTrait>(db: &C, user: i32) -> Result<UserUnit, Refusal> {
  let unit = unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let (own, company, path) = split(path_of(db, unit).await?, unit)?;

  Ok(UserUnit {
    user: shown(user),
    unit: own,
    company,
    path,
  })
}

/// One unit: where it stands, what stands directly under it, who is granted head of it, who stands in it.
pub async fn unit<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Unit, Refusal> {
  let row = one(db, r#"SELECT "parent_id" FROM "organizations" WHERE "id" = $1"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let parent: Option<i32> = row.try_get("", "parent_id")?;
  let (own, company, path) = split(path_of(db, unit).await?, unit)?;
  let children = all(
    db,
    r#"SELECT "id", "name" FROM "organizations" WHERE "parent_id" = $1 ORDER BY "name", "id""#,
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
  let heads = all(
    db,
    r#"SELECT DISTINCT "subject_id"
       FROM "relation_tuples"
       WHERE "resource_type" = $1 AND "resource_id" = $2 AND "relation" = $3
         AND "subject_type" = 'user' AND "subject_relation" = ''
         AND ("expires_at" IS NULL OR "expires_at" > now())"#,
    vec![UNIT.into(), unit.to_string().into(), HEAD_GRANT.into()],
  )
  .await?
  .iter()
  .map(|row| row.try_get::<String>("", "subject_id"))
  .collect::<Result<Vec<_>, _>>()?;
  let mut heads: Vec<i32> = heads.iter().filter_map(|head| parsed(head)).collect();
  heads.sort_unstable();
  let members = all(
    db,
    r#"SELECT "id" FROM "users" WHERE "organization_id" = $1 ORDER BY "id""#,
    vec![unit.into()],
  )
  .await?
  .iter()
  .map(|row| Ok(shown(row.try_get::<i32>("", "id")?)))
  .collect::<Result<Vec<_>, Refusal>>()?;

  Ok(Unit {
    id: own.id,
    name: own.name,
    parent: parent.map(i64::from),
    company,
    path,
    children,
    heads: heads.into_iter().map(shown).collect(),
    members,
  })
}

/// The grant a unit check asks for, as a refusal names it.
pub fn head_grant(unit: i32) -> String {
  format!("{UNIT}:{unit}#{HEADS}")
}

/// Whether a user heads a unit: a head grant on it or on a unit above it, or the platform administrator.
pub async fn heads<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<bool, Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let subject = user_subject(db, user).await?;

  Ok(Authz::check(UNIT, unit, HEADS, &subject, db).await?)
}

fn unit_in(path: &str) -> Result<i32, Refusal> {
  path.parse().map_err(|_| Refusal::bad(format!("`{path}` is no unit's number")))
}

async fn user_unit_route(State(service): State<Service>, Path(user): Path<String>) -> Answer<UserUnit> {
  Ok(Json(user_unit(&service.db, user_in(&user)?).await?))
}

async fn unit_route(State(service): State<Service>, Path(asked): Path<String>) -> Answer<Unit> {
  Ok(Json(unit(&service.db, unit_in(&asked)?).await?))
}

async fn unit_check(State(service): State<Service>, Body(ask): Body<UnitCheckAsk>) -> Answer<CheckAnswer> {
  let user = user_in(&ask.user)?;
  let unit =
    i32::try_from(ask.unit).map_err(|_| Refusal::bad(format!("{} is no unit's number", ask.unit)))?;

  Ok(Json(CheckAnswer {
    allowed: heads(&service.db, user, unit).await?,
    grant: head_grant(unit),
    user: Some(shown(user)),
    sender: None,
  }))
}
