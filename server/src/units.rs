//! Companies and organisation units (docs/accounts.md, 「Companies and organisation units」; docs/boundary.md,
//! 「Organisation units」): sumida's organisations read as a tree whose tops are the companies, the unit a user
//! stands in, several people moved into a unit in one act with their place and role there, and whether a user
//! heads a unit, which is sumida's `manage` on it and so reaches every unit below a head's own. Every change of
//! a person's place made here is kept in their history.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post, put};
use bmo_web_client::{
  CheckAnswer, HistoryChange, MemberRole, NewUnit, OWNER_ROLE, PeopleMove, Unit, UnitChange, UnitCheckAsk,
  UnitPlacement, UnitRef, UnitRow, UnitView, Units, UserUnit,
};
use sea_orm::{ConnectionTrait, TransactionTrait};
use serde::Deserialize;
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleFilter, TupleWrite};

use crate::catalogue::{Entry, Roles, named};
use crate::history::{Change, record};
use crate::ids::{parsed, shown};
use crate::readers::actor;
use crate::routes::{Answer, Body, user_in};
use crate::users::user_subject;
use crate::{Refusal, Service, acting, all, attributes, one, posts, run};

/// The kind a unit is in sumida's rules, and the permission that says its holder heads it.
pub const UNIT: &str = "organization";
pub const HEADS: &str = "manage";
/// The relation a head is granted under.
pub const HEAD_GRANT: &str = "manager";

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

/// The role a person carries in their home unit, where they carry one.
pub async fn home_role<C: ConnectionTrait>(db: &C, user: i32) -> Result<Option<Entry>, Refusal> {
  one(
    db,
    r#"SELECT r."id", r."key", r."name", r."place"
       FROM "user_roles" ur JOIN "company_roles" r ON r."id" = ur."role_id"
       WHERE ur."user_id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?
  .map(|row| {
    Ok(Entry {
      id: row.try_get("", "id")?,
      key: row.try_get("", "key")?,
      name: row.try_get("", "name")?,
      place: row.try_get("", "place")?,
    })
  })
  .transpose()
}

/// The role a person carries in their home unit set, or taken away where none is named, kept in their history
/// where it changed.
async fn set_home_role<C: ConnectionTrait>(
  db: &C,
  user: i32,
  unit: i32,
  role: Option<Entry>,
  by: Option<i32>,
) -> Result<(), Refusal> {
  let before = home_role(db, user).await?;

  if before.as_ref().map(|role| role.id) == role.as_ref().map(|role| role.id) {
    return Ok(());
  }

  match &role {
    Some(role) => {
      run(
        db,
        r#"INSERT INTO "user_roles" ("user_id", "role_id") VALUES ($1::bigint, $2)
           ON CONFLICT ("user_id") DO UPDATE SET "role_id" = EXCLUDED."role_id""#,
        vec![user.into(), role.id.into()],
      )
      .await?;
    }
    None => {
      run(db, r#"DELETE FROM "user_roles" WHERE "user_id" = $1::bigint"#, vec![user.into()]).await?;
    }
  }

  record(
    db,
    by,
    Change::new(user, HistoryChange::Role)
      .unit(unit)
      .before(before.as_ref())
      .after(role.as_ref()),
  )
  .await
}

/// The roles a unit's members carry there, in their user ids' order.
async fn member_roles<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<MemberRole>, Refusal> {
  all(
    db,
    r#"SELECT u."id", r."key", r."name", r."place"
       FROM "users" u
       JOIN "user_roles" ur ON ur."user_id" = u."id"
       JOIN "company_roles" r ON r."id" = ur."role_id"
       WHERE u."organization_id" = $1
       ORDER BY u."id""#,
    vec![unit.into()],
  )
  .await?
  .iter()
  .map(|row| {
    Ok(MemberRole {
      user: shown(row.try_get::<i32>("", "id")?),
      role: Entry {
        id: 0,
        key: row.try_get("", "key")?,
        name: row.try_get("", "name")?,
        place: row.try_get("", "place")?,
      }
      .role(),
    })
  })
  .collect()
}

/// The members of a unit whose accounts have left, in their user ids' order (docs/accounts.md, 「A person who
/// leaves」).
async fn departed_members<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<String>, Refusal> {
  all(
    db,
    r#"SELECT u."id" FROM "users" u JOIN "user_departures" d ON d."user_id" = u."id"
       WHERE u."organization_id" = $1 ORDER BY u."id""#,
    vec![unit.into()],
  )
  .await?
  .iter()
  .map(|row| Ok(shown(row.try_get::<i32>("", "id")?)))
  .collect()
}

/// One unit read whole: what `unit` answers, and its kind, short name and the unit it reports to, the members
/// whose accounts have left, the roles its people carry, the people holding a post in it and the appointment
/// running.
pub async fn unit_view<C: ConnectionTrait>(db: &C, asked: i32) -> Result<UnitView, Refusal> {
  let unit = unit(db, asked).await?;
  let attributes = attributes::of(db, asked).await?;

  Ok(UnitView {
    unit,
    kind: attributes.kind,
    short_name: attributes.short_name,
    reports_to: attributes.reports_to,
    left: departed_members(db, asked).await?,
    roles: member_roles(db, asked).await?,
    concurrent: posts::concurrent_in(db, asked).await?,
    acting: acting::running_on(db, asked).await?,
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

pub fn unit_in(path: &str) -> Result<i32, Refusal> {
  path.parse().map_err(|_| Refusal::bad(format!("`{path}` is no unit's number")))
}

async fn user_unit_route(State(service): State<Service>, Path(user): Path<String>) -> Answer<UserUnit> {
  Ok(Json(user_unit(&service.db, user_in(&user)?).await?))
}

async fn unit_route(State(service): State<Service>, Path(asked): Path<String>) -> Answer<UnitView> {
  Ok(Json(unit_view(&service.db, unit_in(&asked)?).await?))
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
  units_listed(db, None).await
}

/// Every unit, or the units of the kind `kind` names alone, companies first and each unit after its parent.
pub async fn units_listed<C: ConnectionTrait>(db: &C, kind: Option<&str>) -> Result<Vec<UnitRow>, Refusal> {
  let rows = all(
    db,
    r#"SELECT o."id", o."name", o."parent_id", k."key" AS "kind_key", k."name" AS "kind_name",
         a."short_name", a."reports_to",
         (SELECT string_agg(up."user_id"::text, ',' ORDER BY up."user_id") FROM "unit_posts" up
            WHERE up."unit_id" = o."id") AS "concurrent",
         (SELECT string_agg(t."subject_id", ',' ORDER BY t."subject_id")
            FROM "relation_tuples" t
            WHERE t."resource_type" = 'organization' AND t."resource_id" = o."id"::text AND t."relation" = 'manager'
              AND t."subject_type" = 'user' AND t."subject_relation" = ''
              AND t."expires_at" IS NOT NULL AND t."expires_at" > now()) AS "acting",
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
       LEFT JOIN "unit_attributes" a ON a."unit_id" = o."id"
       LEFT JOIN "unit_kinds" k ON k."id" = a."kind_id"
       WHERE ($1::text IS NULL OR k."key" = $1)
       ORDER BY "place""#,
    vec![kind.map(str::to_owned).into()],
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
        kind: match row.try_get::<Option<String>>("", "kind_key")? {
          Some(key) => Some(bmo_web_client::KindRef {
            key,
            name: row.try_get("", "kind_name")?,
          }),
          None => None,
        },
        short_name: row.try_get("", "short_name")?,
        reports_to: row.try_get("", "reports_to")?,
        concurrent: split(row.try_get("", "concurrent")?),
        acting: split(row.try_get("", "acting")?),
      })
    })
    .collect()
}

/// A unit made under a parent, or a new company where none is named, with the attributes it is asked to carry.
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
  let made: i32 = row.try_get("", "id")?;

  attributes::write(
    db,
    made,
    &attributes::Change {
      kind: ask.kind.clone().map(Some),
      short_name: ask.short_name.clone().map(Some),
      reports_to: ask.reports_to.map(Some),
    },
  )
  .await?;

  Ok(made)
}

/// A unit renamed, moved under another parent of its own company that does not stand under it and leaves its
/// line passing no unit twice, and its attributes written as asked.
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

    attributes::parent_comes_round(db, unit, parent).await?;

    run(
      db,
      r#"UPDATE "organizations" SET "parent_id" = $1::bigint WHERE "id" = $2::bigint"#,
      vec![parent.into(), unit.into()],
    )
    .await?;
  }

  attributes::write(
    db,
    unit,
    &attributes::Change {
      kind: ask.kind.clone(),
      short_name: ask.short_name.clone(),
      reports_to: ask.reports_to,
    },
  )
  .await
}

/// Whether a user is granted a unit's head lastingly, with no end: a grant no appointment made.
pub async fn heads_lastingly<C: ConnectionTrait>(db: &C, unit: i32, user: i32) -> Result<bool, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT 1 FROM "relation_tuples"
         WHERE "resource_type" = $1 AND "resource_id" = $2 AND "relation" = $3
           AND "subject_type" = 'user' AND "subject_id" = $4 AND "subject_relation" = ''
           AND "expires_at" IS NULL"#,
      vec![UNIT.into(), unit.to_string().into(), HEAD_GRANT.into(), user.to_string().into()],
    )
    .await?
    .is_some(),
  )
}

async fn unit_and_user<C: ConnectionTrait>(db: &C, unit: i32, user: i32) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok(())
}

/// A user granted a unit's head lastingly. An appointment of theirs running there ends, the lasting grant taking
/// its place; a grant that stood already is kept as it stood.
pub async fn grant_head<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  user: i32,
  by: Option<i32>,
) -> Result<(), Refusal> {
  unit_and_user(db, unit, user).await?;
  acting::end_of(db, unit, user, by).await?;

  if heads_lastingly(db, unit, user).await? {
    return Ok(());
  }

  Authz::write_unchecked(
    TupleWrite::new(UNIT, &unit.to_string(), HEAD_GRANT, SubjectKey::user(user)),
    GRANTER,
    db,
  )
  .await?;

  record(db, by, Change::new(user, HistoryChange::HeadGranted).unit(unit)).await
}

/// A user's lasting head grant on a unit taken away, an appointment of theirs there left running.
pub async fn take_lasting_head<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  user: i32,
  by: Option<i32>,
) -> Result<(), Refusal> {
  if !heads_lastingly(db, unit, user).await? {
    return Ok(());
  }

  run(
    db,
    r#"DELETE FROM "relation_tuples"
       WHERE "resource_type" = $1 AND "resource_id" = $2 AND "relation" = $3
         AND "subject_type" = 'user' AND "subject_id" = $4 AND "subject_relation" = ''
         AND "expires_at" IS NULL"#,
    vec![UNIT.into(), unit.to_string().into(), HEAD_GRANT.into(), user.to_string().into()],
  )
  .await?;

  record(db, by, Change::new(user, HistoryChange::HeadTaken).unit(unit)).await
}

/// Every head grant of a user's on a unit taken away: the lasting one and an appointment's.
pub async fn take_head<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  user: i32,
  by: Option<i32>,
) -> Result<(), Refusal> {
  unit_and_user(db, unit, user).await?;
  acting::end_of(db, unit, user, by).await?;
  take_lasting_head(db, unit, user, by).await?;
  // A grant of any other shape on the unit goes as well, so no head stands where the act takes heads away.
  Authz::revoke_unchecked(
    TupleFilter::object(UNIT, &unit.to_string())
      .relations(&[HEAD_GRANT])
      .subject(SubjectKey::user(user)),
    db,
  )
  .await?;

  Ok(())
}

/// A user's home unit set, kept in their history where it changed. A post they held in it ends, the unit being
/// their home now, and every post outside its company ends with a move into another company.
pub async fn place<C: ConnectionTrait>(
  db: &C,
  user: i32,
  unit: i32,
  by: Option<i32>,
) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let before = unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  if before == unit {
    return Ok(());
  }

  run(
    db,
    r#"UPDATE "users" SET "organization_id" = $1::bigint WHERE "id" = $2::bigint"#,
    vec![unit.into(), user.into()],
  )
  .await?;
  record(db, by, Change::new(user, HistoryChange::Placed).unit(unit).from(before)).await?;
  posts::take(db, user, unit, by).await?;

  let company = company_of(db, unit).await?;

  if company_of(db, before).await? != company {
    posts::take_every(db, user, company, by).await?;
  }

  Ok(())
}

/// One person of a move, read off the ask.
struct Mover {
  user: i32,
  from: i32,
  head: bool,
  /// The role asked: none where the ask names none, some none where it names none to carry.
  role: Option<Option<String>>,
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
      role: person.role.clone(),
    });
  }

  Ok(movers)
}

/// Several people moved into a unit in one act (docs/accounts.md, 「Companies and organisation units」): each
/// placed in it, holding its head or not as asked, carrying the role asked, and no longer granted head of the
/// unit they leave. Written in one transaction, so one refusal leaves everybody where they stood; the transaction
/// is committed or rolled back before the answer, never left to its drop.
pub async fn move_people<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  unit: i32,
  ask: &PeopleMove,
  by: Option<i32>,
) -> Result<(), Refusal> {
  let movers = movers(ask)?;
  let txn = db.begin().await?;

  match moved_into(&txn, unit, &movers, by).await {
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

async fn moved_into<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  movers: &[Mover],
  by: Option<i32>,
) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let company = company_of(db, unit).await?.ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let mut roles: Vec<Option<Option<Entry>>> = Vec::with_capacity(movers.len());

  // Every person is read, and held against another change, and every role named found, before anybody is
  // written.
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

    roles.push(match &mover.role {
      Some(Some(key)) => Some(Some(named::<Roles, _>(db, company, key.trim()).await?)),
      Some(None) => Some(None),
      None => None,
    });
  }

  for (mover, role) in movers.iter().zip(roles) {
    let comes = mover.from != unit;

    if comes {
      take_head(db, mover.from, mover.user, by).await?;
      place(db, mover.user, unit, by).await?;
    }

    if mover.head {
      grant_head(db, unit, mover.user, by).await?;
    } else {
      take_lasting_head(db, unit, mover.user, by).await?;
    }

    let role = match role {
      Some(asked) => asked,
      None if comes => None,
      None => home_role(db, mover.user).await?,
    };

    set_home_role(db, mover.user, unit, role, by).await?;
  }

  Ok(())
}

/// What the units' list is asked for: the kind it narrows to, where one is named.
#[derive(Debug, Default, Deserialize)]
pub struct UnitsAsk {
  kind: Option<String>,
}

async fn units_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Query(ask): Query<UnitsAsk>,
) -> Answer<Units> {
  administrator(&headers)?;
  let kind = ask.kind.as_deref().map(str::trim).filter(|kind| !kind.is_empty());

  Ok(Json(Units {
    units: units_listed(&service.db, kind).await?,
  }))
}

async fn make_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<NewUnit>,
) -> Result<(StatusCode, Json<UnitView>), Refusal> {
  administrator(&headers)?;
  let txn = service.db.begin().await?;
  let made = match make(&txn, &ask).await {
    Ok(made) => {
      txn.commit().await?;
      made
    }
    Err(refused) => {
      txn.rollback().await?;

      return Err(refused);
    }
  };

  Ok((StatusCode::CREATED, Json(unit_view(&service.db, made).await?)))
}

async fn change_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(asked): Path<String>,
  Body(ask): Body<UnitChange>,
) -> Answer<UnitView> {
  administrator(&headers)?;
  let asked = unit_in(&asked)?;
  let txn = service.db.begin().await?;

  match change(&txn, asked, &ask).await {
    Ok(()) => txn.commit().await?,
    Err(refused) => {
      txn.rollback().await?;

      return Err(refused);
    }
  }

  Ok(Json(unit_view(&service.db, asked).await?))
}

async fn head_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path((asked, user)): Path<(String, String)>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers)?;
  grant_head(&service.db, unit_in(&asked)?, user_in(&user)?, actor(&headers)).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn unhead_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path((asked, user)): Path<(String, String)>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers)?;
  take_head(&service.db, unit_in(&asked)?, user_in(&user)?, actor(&headers)).await?;

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
  let by = actor(&headers);
  let before = unit_of_user(&service.db, user).await?;

  place(&service.db, user, asked, by).await?;

  // The role a person carried stood in the unit they left.
  if before != Some(asked) {
    set_home_role(&service.db, user, asked, None, by).await?;
  }

  Ok(Json(user_unit(&service.db, user).await?))
}

async fn move_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(asked): Path<String>,
  Body(ask): Body<PeopleMove>,
) -> Answer<UnitView> {
  administrator(&headers)?;
  let asked = unit_in(&asked)?;
  move_people(&service.db, asked, &ask, actor(&headers)).await?;

  Ok(Json(unit_view(&service.db, asked).await?))
}

/// An account marked left (docs/accounts.md, 「A person who leaves」): its sign-in disabled for good and the moment
/// and the marker kept, by the administrator or a head of the unit the user stands in. Its posts and its
/// appointments end, each kept in its history.
async fn leave_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;
  let marker = actor(&headers).ok_or_else(|| {
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

  let txn = service.db.begin().await?;

  match left(&txn, user, marker).await {
    Ok(()) => txn.commit().await?,
    Err(refused) => {
      txn.rollback().await?;

      return Err(refused);
    }
  }

  Ok(StatusCode::NO_CONTENT)
}

async fn left<C: ConnectionTrait>(db: &C, user: i32, marker: i32) -> Result<(), Refusal> {
  run(
    db,
    r#"UPDATE "users" SET "is_enabled" = false, "updated_at" = now() WHERE "id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?;
  let marked = run(
    db,
    r#"INSERT INTO "user_departures" ("user_id", "left_at", "left_by") VALUES ($1::bigint, $2, $3::bigint)
       ON CONFLICT ("user_id") DO NOTHING"#,
    vec![user.into(), crate::now_ms().into(), marker.into()],
  )
  .await?;

  posts::take_every(db, user, None, Some(marker)).await?;
  acting::end_every(db, user, Some(marker)).await?;

  if marked > 0 {
    record(db, Some(marker), Change::new(user, HistoryChange::Left)).await?;
  }

  Ok(())
}
