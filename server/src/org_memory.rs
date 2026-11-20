//! A unit's org memory (docs/accounts.md, 「A unit's org memory」; docs/boundary.md, 「Organisation units」,
//! 「Checks」): who writes what every agent serving a unit's people shares. The brain keeps the memory and calls no
//! unit, so its caller asks here before each write. A head writes it by heading the unit; anyone else writes it by
//! the unit's grant, a `write` tuple on the unit's `bmo_org_memory` object, which a head gives and takes.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post, put};
use bmo_web_client::{
  CheckAnswer, MemoryWriter, MemoryWriters, OrgMemoryUnit, OrgMemoryUnits, UnitCheckAsk, UnitRef,
};
use sea_orm::ConnectionTrait;
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleFilter, TupleWrite};

use crate::ids::shown;
use crate::readers::{Reader, reader};
use crate::routes::{Answer, Body, user_in};
use crate::units::{company_of, every_unit, heads, unit_in, unit_of_user};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one};

/// The kind a unit's org memory is in the deployment's rules, the relation its grant is written under and the
/// permission that says its holder writes it.
pub const ORG_MEMORY: &str = "bmo_org_memory";
const WRITE: &str = "write";
const MAY_WRITE: &str = "may_write";

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/units/{unit}/memory-writers", get(writers_route))
    .route("/units/{unit}/memory-writers/{user}", put(grant_route).delete(take_route))
    .route("/org-memory/units", get(units_route))
    .route("/checks/org-memory", post(check_route))
}

/// The grant an org memory check asks for, as a refusal names it.
pub fn memory_grant(unit: i32) -> String {
  format!("{ORG_MEMORY}:{unit}#{MAY_WRITE}")
}

/// Whether a user holds a unit's org memory write: the grant on that unit, or the platform administrator.
pub async fn holds_grant<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<bool, Refusal> {
  let subject = user_subject(db, user).await?;

  Ok(Authz::check_object(ORG_MEMORY, &unit.to_string(), MAY_WRITE, &subject, db).await?)
}

/// Whether a user writes a unit's org memory: heading it or a unit above it, or holding its grant.
pub async fn writes<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<bool, Refusal> {
  Ok(heads(db, user, unit).await? || holds_grant(db, user, unit).await?)
}

/// The people granted a unit's org memory write, by name then id, each with the user who gave it where a person
/// did.
pub async fn writers_of<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<MemoryWriter>, Refusal> {
  let rows = all(
    db,
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name", t."created_by"
       FROM "relation_tuples" t
       JOIN "users" u ON u."id"::text = t."subject_id"
       WHERE t."resource_type" = $1 AND t."resource_id" = $2 AND t."relation" = $3
         AND t."subject_type" = 'user' AND t."subject_relation" = ''
         AND (t."expires_at" IS NULL OR t."expires_at" > now())
       ORDER BY "name", u."id""#,
    vec![ORG_MEMORY.into(), unit.to_string().into(), WRITE.into()],
  )
  .await?;

  rows
    .iter()
    .map(|row| {
      let by: Option<String> = row.try_get("", "created_by")?;

      Ok(MemoryWriter {
        user: shown(row.try_get("", "id")?),
        name: row.try_get("", "name")?,
        by: by.filter(|giver| giver.parse::<i32>().is_ok()),
      })
    })
    .collect()
}

/// The unit a writers' route names, where the reader may give and take its grant: the administrator and a head of
/// the unit or of one above. A unit of another company is answered as if it did not stand.
async fn granting_unit(
  service: &Service,
  headers: &HeaderMap,
  unit: &str,
) -> Result<(Reader, i32, i32), Refusal> {
  let reader = reader(&service.db, headers).await?;
  let (unit, company) = reader.reached(&service.db, unit).await?;

  if !reader.heads(&service.db, unit).await? {
    return Err(Refusal::forbidden(
      "a unit's org memory write is given by the administrator or a head of the unit or of one above",
    ));
  }

  Ok((reader, unit, company))
}

async fn writers_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
) -> Answer<MemoryWriters> {
  let (_, unit, _) = granting_unit(&service, &headers, &unit).await?;

  Ok(Json(MemoryWriters {
    writers: writers_of(&service.db, unit).await?,
  }))
}

/// A person of the unit's company who has not left, as a grant names them.
async fn grantee<C: ConnectionTrait>(db: &C, user: &str, company: i32) -> Result<i32, Refusal> {
  let user = user_in(user)?;
  let home = unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  if company_of(db, home).await? != Some(company) {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "a unit's org memory write is given within its company alone")
        .coded("other-company"),
    );
  }

  let left = one(db, r#"SELECT 1 FROM "user_departures" WHERE "user_id" = $1::bigint"#, vec![user.into()])
    .await?
    .is_some();

  if left {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "an account that has left is given nothing").coded("left"),
    );
  }

  Ok(user)
}

async fn grant_route(
  State(service): State<Service>,
  Path((unit, user)): Path<(String, String)>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let (reader, unit, company) = granting_unit(&service, &headers, &unit).await?;
  let user = grantee(&service.db, &user, company).await?;

  Authz::write_unchecked(
    TupleWrite::new(ORG_MEMORY, &unit.to_string(), WRITE, SubjectKey::user(user)),
    &shown(reader.user),
    &service.db,
  )
  .await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn take_route(
  State(service): State<Service>,
  Path((unit, user)): Path<(String, String)>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let (_, unit, _) = granting_unit(&service, &headers, &unit).await?;
  let user = user_in(&user)?;

  unit_of_user(&service.db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  Authz::revoke_unchecked(
    TupleFilter::object(ORG_MEMORY, &unit.to_string())
      .relations(&[WRITE])
      .subject(SubjectKey::user(user)),
    &service.db,
  )
  .await?;

  Ok(StatusCode::NO_CONTENT)
}

/// The units whose org memory the reader writes, in the tree's order: every unit for the administrator, else those
/// they head and those they hold the grant on.
async fn units_route(State(service): State<Service>, headers: HeaderMap) -> Answer<OrgMemoryUnits> {
  let db = &service.db;
  let reader = reader(db, &headers).await?;
  let mut companies: std::collections::HashMap<i64, UnitRef> = std::collections::HashMap::new();
  let mut units = Vec::new();

  for unit in every_unit(db).await? {
    let own = UnitRef {
      id: unit.id,
      name: unit.name.clone(),
    };
    let company = unit.parent.and_then(|parent| companies.get(&parent).cloned()).unwrap_or(own);

    companies.insert(unit.id, company.clone());

    let id =
      i32::try_from(unit.id).map_err(|_| Refusal::bad(format!("{} is no unit's number", unit.id)))?;
    let head = reader.heads(db, id).await?;

    if head || holds_grant(db, reader.user, id).await? {
      units.push(OrgMemoryUnit {
        id: unit.id,
        name: unit.name,
        parent: unit.parent,
        company,
        head,
      });
    }
  }

  Ok(Json(OrgMemoryUnits { units }))
}

async fn check_route(State(service): State<Service>, Body(ask): Body<UnitCheckAsk>) -> Answer<CheckAnswer> {
  let db = &service.db;
  let user = user_in(&ask.user)?;
  let unit = unit_in(&ask.unit.to_string())?;

  unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok(Json(CheckAnswer {
    allowed: writes(db, user, unit).await?,
    grant: memory_grant(unit),
    user: Some(shown(user)),
    sender: None,
  }))
}
