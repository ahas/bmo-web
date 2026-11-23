//! The named groups of people a rule of the chain may name (docs/accounts.md, 「Rules and groups」): each kept by
//! a unit, read by anyone of its company, and made, changed and removed by the administrator and the unit's heads.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use bmo_web_client::{ChainGroup, ChainGroupAsk, ChainGroups, ChainGroupsAsk};
use sea_orm::{ConnectionTrait, TransactionTrait};

use crate::ids::{parsed, shown};
use crate::readers::{Reader, reader};
use crate::routes::{Answer, Body};
use crate::units::company_of;
use crate::{Refusal, Service, all, now_ms, one, run};

/// The most characters a group's name may hold.
pub const NAME_MOST: usize = 40;

pub fn routes() -> axum::Router<Service> {
  Router::new()
    .route("/chain/groups", get(list_route).post(make_route))
    .route("/chain/groups/{group}", get(read_route).put(change_route).delete(remove_route))
}

/// A group read whole.
async fn group<C: ConnectionTrait>(db: &C, id: i64) -> Result<ChainGroup, Refusal> {
  let row = one(
    db,
    r#"SELECT "id", "unit_id", "name" FROM "chain_groups" WHERE "id" = $1"#,
    vec![id.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no group {id}")))?;
  let members = all(
    db,
    r#"SELECT "user_id"::integer AS "user" FROM "chain_group_members" WHERE "group_id" = $1 ORDER BY "user_id""#,
    vec![id.into()],
  )
  .await?
  .iter()
  .map(|row| Ok(shown(row.try_get("", "user")?)))
  .collect::<Result<Vec<_>, Refusal>>()?;

  Ok(ChainGroup {
    id,
    unit: row.try_get("", "unit_id")?,
    name: row.try_get("", "name")?,
    members,
  })
}

/// The company of a unit, answered as if nothing stood there for a reader of another.
async fn reached<C: ConnectionTrait>(db: &C, who: &Reader, unit: i64) -> Result<i32, Refusal> {
  let unit = i32::try_from(unit).map_err(|_| Refusal::bad(format!("{unit} is no unit's number")))?;
  let absent = || Refusal::absent(format!("no unit {unit}"));
  let company = company_of(db, unit).await?.ok_or_else(absent)?;

  if !who.reaches(company) {
    return Err(absent());
  }

  Ok(company)
}

/// A reader who may change the groups a unit keeps: the administrator and the unit's heads.
async fn keeps<C: ConnectionTrait>(db: &C, who: &Reader, unit: i64) -> Result<(), Refusal> {
  reached(db, who, unit).await?;

  if !who.heads(db, unit as i32).await? {
    return Err(Refusal::forbidden("a unit's groups are kept by the administrator and its heads"));
  }

  Ok(())
}

/// A group's name and members judged: a line of 1 to 40 characters, and people of the unit's company.
async fn judged<C: ConnectionTrait>(
  db: &C,
  ask: &ChainGroupAsk,
  company: i32,
) -> Result<Vec<i32>, Refusal> {
  let name = ask.name.trim();

  if name.is_empty() || name.chars().count() > NAME_MOST || name.contains(['\n', '\r']) {
    return Err(Refusal::bad("a group's name is one line of 1 to 40 characters"));
  }

  let mut members = Vec::with_capacity(ask.members.len());

  for member in &ask.members {
    let user = parsed(member).ok_or_else(|| Refusal::bad(format!("`{member}` is no user's id")))?;
    let unit = super::home_of(db, user).await?;

    if company_of(db, unit).await? != Some(company) {
      return Err(
        Refusal::new(StatusCode::CONFLICT, format!("user {user} stands in another company"))
          .coded("other-company"),
      );
    }
    if !members.contains(&user) {
      members.push(user);
    }
  }

  Ok(members)
}

/// The name and members written, refused where another group of the unit holds the name.
async fn write<C: ConnectionTrait>(
  db: &C,
  id: i64,
  unit: i64,
  name: &str,
  members: &[i32],
  by: i32,
) -> Result<(), Refusal> {
  let taken = one(
    db,
    r#"SELECT 1 AS "taken" FROM "chain_groups" WHERE "unit_id" = $1 AND lower("name") = lower($2) AND "id" <> $3"#,
    vec![unit.into(), name.into(), id.into()],
  )
  .await?;

  if taken.is_some() {
    return Err(
      Refusal::new(StatusCode::CONFLICT, format!("the unit keeps a group named `{name}`"))
        .coded("group-exists"),
    );
  }

  run(
    db,
    r#"UPDATE "chain_groups" SET "name" = $2, "set_by" = $3, "set_at" = $4 WHERE "id" = $1"#,
    vec![id.into(), name.into(), i64::from(by).into(), now_ms().into()],
  )
  .await?;
  run(db, r#"DELETE FROM "chain_group_members" WHERE "group_id" = $1"#, vec![id.into()]).await?;
  for member in members {
    run(
      db,
      r#"INSERT INTO "chain_group_members" ("group_id", "user_id") VALUES ($1, $2)"#,
      vec![id.into(), i64::from(*member).into()],
    )
    .await?;
  }

  Ok(())
}

async fn list_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Query(ask): Query<ChainGroupsAsk>,
) -> Answer<ChainGroups> {
  let db = &service.db;
  let who = reader(db, &headers).await?;

  reached(db, &who, ask.unit).await?;

  let mut groups = Vec::new();

  for row in all(
    db,
    r#"SELECT "id" FROM "chain_groups" WHERE "unit_id" = $1 ORDER BY lower("name"), "id""#,
    vec![ask.unit.into()],
  )
  .await?
  {
    groups.push(group(db, row.try_get("", "id")?).await?);
  }

  Ok(Json(ChainGroups { groups }))
}

async fn make_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<ChainGroupAsk>,
) -> Result<(StatusCode, Json<ChainGroup>), Refusal> {
  let db = &service.db;
  let who = reader(db, &headers).await?;
  let unit = ask
    .unit
    .ok_or_else(|| Refusal::bad("a group is made in a unit, and the body names none"))?;

  keeps(db, &who, unit).await?;

  let members = judged(db, &ask, reached(db, &who, unit).await?).await?;
  let txn = db.begin().await?;
  let id: i64 = one(
    &txn,
    r#"INSERT INTO "chain_groups" ("unit_id", "name", "set_by", "set_at") VALUES ($1, '', $2, $3) RETURNING "id""#,
    vec![unit.into(), i64::from(who.user).into(), now_ms().into()],
  )
  .await?
  .expect("an insert answers its row")
  .try_get("", "id")?;

  write(&txn, id, unit, ask.name.trim(), &members, who.user).await?;
  txn.commit().await?;

  Ok((StatusCode::CREATED, Json(group(db, id).await?)))
}

async fn read_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(id): Path<i64>,
) -> Answer<ChainGroup> {
  let db = &service.db;
  let who = reader(db, &headers).await?;
  let found = group(db, id).await?;

  reached(db, &who, found.unit).await?;

  Ok(Json(found))
}

async fn change_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(id): Path<i64>,
  Body(ask): Body<ChainGroupAsk>,
) -> Answer<ChainGroup> {
  let db = &service.db;
  let who = reader(db, &headers).await?;
  let found = group(db, id).await?;

  keeps(db, &who, found.unit).await?;

  let members = judged(db, &ask, reached(db, &who, found.unit).await?).await?;
  let txn = db.begin().await?;

  write(&txn, id, found.unit, ask.name.trim(), &members, who.user).await?;
  txn.commit().await?;

  Ok(Json(group(db, id).await?))
}

async fn remove_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(id): Path<i64>,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let who = reader(db, &headers).await?;
  let found = group(db, id).await?;

  keeps(db, &who, found.unit).await?;

  let named = one(
    db,
    r#"SELECT 1 AS "named" FROM "chain_rules" WHERE "who_group" = $1 LIMIT 1"#,
    vec![id.into()],
  )
  .await?;

  if named.is_some() {
    return Err(
      Refusal::new(StatusCode::CONFLICT, format!("a rule names group {id}")).coded("group-in-use"),
    );
  }

  run(db, r#"DELETE FROM "chain_groups" WHERE "id" = $1"#, vec![id.into()]).await?;

  Ok(StatusCode::NO_CONTENT)
}
