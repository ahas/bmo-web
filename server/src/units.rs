//! Companies and organisation units (docs/accounts.md, 「Companies and organisation units」; docs/boundary.md,
//! 「Organisation units」): sumida's organisations read as a tree whose tops are the companies, the unit a user
//! stands in, several people moved into a unit in one act, and whether a user heads a unit, which is sumida's
//! `manage` on it and so reaches every unit below a head's own.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post, put};
use bmo_web_client::{
  CheckAnswer, NewUnit, OWNER_KEY, OWNER_ROLE, PeopleMove, Unit, UnitChange, UnitCheckAsk, UnitPlacement,
  UnitRef, UnitRow, Units, UserUnit,
};
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleFilter, TupleWrite};

use crate::ids::{parsed, shown};
use crate::routes::{Answer, Body, user_in};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one, run};

/// The kind a unit is in sumida's rules, and the permission that says its holder heads it.
pub const UNIT: &str = "organization";
const HEADS: &str = "manage";
/// The relation a head is granted under.
const HEAD_GRANT: &str = "manager";

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/unit", get(user_unit_route).put(place_route))
    .route("/units", get(units_route).post(make_route))
    .route("/units/{unit}", get(unit_route).patch(change_route))
    .route("/units/{unit}/heads/{user}", put(head_route).delete(unhead_route))
    .route("/units/{unit}/members", post(move_route))
    .route("/users/{user}/leave", post(leave_route))
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
    one(
      db,
      r#"SELECT "organization_id" FROM "users" WHERE "id" = $1::bigint"#,
      vec![user.into()],
    )
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
  let row = one(
    db,
    r#"SELECT "parent_id" FROM "organizations" WHERE "id" = $1::bigint"#,
    vec![unit.into()],
  )
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
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
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

// ---------------------------------------------------------------------------------------------------------
// The administrator's organisation (docs/accounts.md, 「Companies and organisation units」)

/// Who grants a head: the console's organisation screen.
const GRANTER: &str = "organisation";

pub(crate) fn administrator(headers: &HeaderMap) -> Result<(), Refusal> {
  match headers.get(OWNER_ROLE).and_then(|role| role.to_str().ok()) {
    Some("administrator") => Ok(()),
    _ => Err(Refusal::forbidden(
      "the organisation is the administrator's: the call names no `Owner-Role: administrator`",
    )),
  }
}

fn name_of(name: &str) -> Result<String, Refusal> {
  let name = name.trim();

  if name.is_empty() {
    Err(Refusal::bad("a unit's name is empty"))
  } else {
    Ok(name.to_owned())
  }
}

/// Every unit, companies first and each unit after its parent.
pub async fn every_unit<C: ConnectionTrait>(db: &C) -> Result<Vec<UnitRow>, Refusal> {
  let rows = all(
    db,
    r#"SELECT o."id", o."name", o."parent_id",
         (SELECT string_agg(t."subject_id", ',' ORDER BY t."subject_id")
            FROM "relation_tuples" t
            WHERE t."resource_type" = 'organization' AND t."resource_id" = o."id"::text AND t."relation" = 'manager'
              AND t."subject_type" = 'user' AND t."subject_relation" = ''
              AND (t."expires_at" IS NULL OR t."expires_at" > now())) AS "heads",
         (SELECT string_agg(u."id"::text, ',' ORDER BY u."id") FROM "users" u WHERE u."organization_id" = o."id") AS "members",
         (SELECT string_agg(u."id"::text, ',' ORDER BY u."id") FROM "users" u
            JOIN "user_departures" d ON d."user_id" = u."id" WHERE u."organization_id" = o."id") AS "left",
         (SELECT string_agg(lpad(c."ancestor_id"::text, 10, '0'), '/' ORDER BY c."depth" DESC)
            FROM "org_closure" c WHERE c."descendant_id" = o."id") AS "place"
       FROM "organizations" o
       ORDER BY "place""#,
    vec![],
  )
  .await?;
  let split = |text: Option<String>| -> Vec<String> {
    text
      .map(|text| text.split(',').filter(|one| !one.is_empty()).map(str::to_owned).collect())
      .unwrap_or_default()
  };

  rows
    .iter()
    .map(|row| {
      Ok(UnitRow {
        id: i64::from(row.try_get::<i32>("", "id")?),
        name: row.try_get("", "name")?,
        parent: row.try_get::<Option<i32>>("", "parent_id")?.map(i64::from),
        heads: split(row.try_get("", "heads")?),
        members: split(row.try_get("", "members")?),
        left: split(row.try_get("", "left")?),
      })
    })
    .collect()
}

/// A unit made under a parent, or a new company where none is named.
pub async fn make<C: ConnectionTrait>(db: &C, ask: &NewUnit) -> Result<i32, Refusal> {
  let name = name_of(&ask.name)?;
  let parent = match ask.parent {
    Some(parent) => {
      let parent =
        i32::try_from(parent).map_err(|_| Refusal::bad(format!("{parent} is no unit's number")))?;
      one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![parent.into()])
        .await?
        .ok_or_else(|| Refusal::absent(format!("no unit {parent}")))?;
      Some(parent)
    }
    None => None,
  };
  let row = one(
    db,
    r#"INSERT INTO "organizations" ("name", "parent_id") VALUES ($1, $2::bigint) RETURNING "id""#,
    vec![name.into(), parent.into()],
  )
  .await?
  .ok_or_else(|| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, "the unit was not made"))?;

  Ok(row.try_get("", "id")?)
}

/// A unit renamed, or moved under another parent of its own company that does not stand under it.
pub async fn change<C: ConnectionTrait>(db: &C, unit: i32, ask: &UnitChange) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;

  if let Some(name) = &ask.name {
    run(
      db,
      r#"UPDATE "organizations" SET "name" = $1 WHERE "id" = $2::bigint"#,
      vec![name_of(name)?.into(), unit.into()],
    )
    .await?;
  }

  if let Some(parent) = ask.parent {
    let parent =
      i32::try_from(parent).map_err(|_| Refusal::bad(format!("{parent} is no unit's number")))?;
    let parent_company = company_of(db, parent)
      .await?
      .ok_or_else(|| Refusal::absent(format!("no unit {parent}")))?;

    if company_of(db, unit).await? != Some(parent_company) {
      return Err(Refusal::new(StatusCode::CONFLICT, "a unit stays in its company").coded("other-company"));
    }

    if path_of(db, parent).await?.iter().any(|above| above.id == i64::from(unit)) {
      return Err(Refusal::new(StatusCode::CONFLICT, "a unit cannot stand under itself").coded("cycle"));
    }

    run(
      db,
      r#"UPDATE "organizations" SET "parent_id" = $1::bigint WHERE "id" = $2::bigint"#,
      vec![parent.into(), unit.into()],
    )
    .await?;
  }

  Ok(())
}

/// A user granted head of a unit, or the grant taken away.
pub async fn set_head<C: ConnectionTrait>(db: &C, unit: i32, user: i32, head: bool) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let object = unit.to_string();

  if head {
    Authz::write_unchecked(TupleWrite::new(UNIT, &object, HEAD_GRANT, SubjectKey::user(user)), GRANTER, db)
      .await?;
  } else {
    Authz::revoke_unchecked(
      TupleFilter::object(UNIT, &object)
        .relations(&[HEAD_GRANT])
        .subject(SubjectKey::user(user)),
      db,
    )
    .await?;
  }

  Ok(())
}

/// A user placed in a unit.
pub async fn place<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let moved = run(
    db,
    r#"UPDATE "users" SET "organization_id" = $1::bigint WHERE "id" = $2::bigint"#,
    vec![unit.into(), user.into()],
  )
  .await?;

  if moved == 0 {
    return Err(Refusal::absent(format!("no user {user}")));
  }

  Ok(())
}

/// One person of a move, read off the ask.
struct Mover {
  user: i32,
  from: i32,
  head: bool,
}

/// The people a move names, each once; refused before anything is read where it names none, names one twice or
/// names what is no user's id or no unit's number.
fn movers(ask: &PeopleMove) -> Result<Vec<Mover>, Refusal> {
  if ask.people.is_empty() {
    return Err(Refusal::bad("a move names nobody"));
  }

  let mut movers: Vec<Mover> = Vec::with_capacity(ask.people.len());

  for person in &ask.people {
    let user = user_in(&person.user)?;
    let from = i32::try_from(person.from)
      .map_err(|_| Refusal::bad(format!("{} is no unit's number", person.from)))?;

    if movers.iter().any(|named| named.user == user) {
      return Err(Refusal::bad(format!("user {user} is named twice")));
    }

    movers.push(Mover {
      user,
      from,
      head: person.head,
    });
  }

  Ok(movers)
}

/// Several people moved into a unit in one act (docs/accounts.md, 「Companies and organisation units」): each
/// placed in it, holding its head or not as asked, and no longer granted head of the unit they leave. Written
/// in one transaction, so one refusal leaves everybody where they stood; the transaction is committed or rolled
/// back before the answer, never left to its drop.
pub async fn move_people<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  unit: i32,
  ask: &PeopleMove,
) -> Result<(), Refusal> {
  let movers = movers(ask)?;
  let txn = db.begin().await?;

  match moved_into(&txn, unit, &movers).await {
    Ok(()) => {
      txn.commit().await?;

      Ok(())
    }
    Err(refused) => {
      txn.rollback().await?;

      Err(refused)
    }
  }
}

async fn moved_into<C: ConnectionTrait>(db: &C, unit: i32, movers: &[Mover]) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;

  // Every person is read, and held against another change, before anybody is written.
  for mover in movers {
    let row = one(
      db,
      r#"SELECT u."organization_id",
           EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = u."id") AS "has_left"
         FROM "users" u
         WHERE u."id" = $1::bigint
         FOR UPDATE OF u"#,
      vec![mover.user.into()],
    )
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {}", mover.user)))?;

    if row.try_get::<bool>("", "has_left")? {
      return Err(
        Refusal::new(StatusCode::CONFLICT, "an account that has left is moved nowhere").coded("left"),
      );
    }

    if row.try_get::<i32>("", "organization_id")? != mover.from {
      return Err(
        Refusal::new(
          StatusCode::CONFLICT,
          format!("user {} no longer stands in unit {}", mover.user, mover.from),
        )
        .coded("moved"),
      );
    }
  }

  for mover in movers {
    if mover.from != unit {
      set_head(db, mover.from, mover.user, false).await?;
      place(db, mover.user, unit).await?;
    }

    // Taken away first, so a head named again holds one grant, as a head granted once does.
    set_head(db, unit, mover.user, false).await?;

    if mover.head {
      set_head(db, unit, mover.user, true).await?;
    }
  }

  Ok(())
}

async fn units_route(State(service): State<Service>, headers: HeaderMap) -> Answer<Units> {
  administrator(&headers)?;

  Ok(Json(Units {
    units: every_unit(&service.db).await?,
  }))
}

async fn make_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<NewUnit>,
) -> Result<(StatusCode, Json<Unit>), Refusal> {
  administrator(&headers)?;
  let made = make(&service.db, &ask).await?;

  Ok((StatusCode::CREATED, Json(unit(&service.db, made).await?)))
}

async fn change_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(asked): Path<String>,
  Body(ask): Body<UnitChange>,
) -> Answer<Unit> {
  administrator(&headers)?;
  let asked = unit_in(&asked)?;
  change(&service.db, asked, &ask).await?;

  Ok(Json(unit(&service.db, asked).await?))
}

async fn head_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path((asked, user)): Path<(String, String)>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers)?;
  set_head(&service.db, unit_in(&asked)?, user_in(&user)?, true).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn unhead_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path((asked, user)): Path<(String, String)>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers)?;
  set_head(&service.db, unit_in(&asked)?, user_in(&user)?, false).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn place_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
  Body(ask): Body<UnitPlacement>,
) -> Answer<UserUnit> {
  administrator(&headers)?;
  let user = user_in(&user)?;
  let asked =
    i32::try_from(ask.unit).map_err(|_| Refusal::bad(format!("{} is no unit's number", ask.unit)))?;
  place(&service.db, user, asked).await?;

  Ok(Json(user_unit(&service.db, user).await?))
}

async fn move_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(asked): Path<String>,
  Body(ask): Body<PeopleMove>,
) -> Answer<Unit> {
  administrator(&headers)?;
  let asked = unit_in(&asked)?;
  move_people(&service.db, asked, &ask).await?;

  Ok(Json(unit(&service.db, asked).await?))
}

/// An account marked left (docs/accounts.md, 「A person who leaves」): its sign-in disabled for good and the moment
/// and the marker kept, by the administrator or a head of the unit the user stands in.
async fn leave_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;
  let marker = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    .ok_or_else(|| {
      Refusal::forbidden("a departure is marked by a signed-in user, and the call names none")
    })?;
  let unit = unit_of_user(&service.db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  if administrator(&headers).is_err() && !heads(&service.db, marker, unit).await? {
    return Err(Refusal::forbidden(
      "a departure is marked by the administrator or by a head of the unit the user stands in",
    ));
  }

  run(
    &service.db,
    r#"UPDATE "users" SET "is_enabled" = false, "updated_at" = now() WHERE "id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?;
  run(
    &service.db,
    r#"INSERT INTO "user_departures" ("user_id", "left_at", "left_by") VALUES ($1::bigint, $2, $3::bigint)
       ON CONFLICT ("user_id") DO NOTHING"#,
    vec![user.into(), crate::now_ms().into(), marker.into()],
  )
  .await?;

  Ok(StatusCode::NO_CONTENT)
}
