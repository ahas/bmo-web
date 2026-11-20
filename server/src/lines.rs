//! The line of a unit (docs/accounts.md, 「The line of a unit」; docs/boundary.md, 「Organisation units」): the
//! chain a unit's matters go up, through the unit it reports to where one is set and its parent otherwise, up to
//! its company, each step with its heads and the people holding each role there; and who stands for one role for
//! the unit, the nearest holders on the line, or else the holders of the next lower role, marked acting. Both
//! read for anyone of the unit's company and answer anyone of another as if nothing stood there.

use std::collections::HashSet;

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{
  LineHead, LineHolder, LineRole, LineStep, LineVia, RoleHolder, RoleStand, StandReason, UnitLine, UnitRef,
};
use sea_orm::ConnectionTrait;

use crate::acting::acting_grant;
use crate::catalogue::{Entry, Roles, entries};
use crate::ids::shown;
use crate::readers::reader;
use crate::routes::Answer;
use crate::units::{HEAD_GRANT, UNIT};
use crate::{Refusal, Service, all, attributes};

/// One person holding a role at a unit: their id, their name and whether through a post.
struct Holding {
  user: i32,
  name: String,
  role: i64,
  concurrent: bool,
}

/// The people holding a role at a unit, those whose home unit it is and those whose post there carries one, in
/// the order of their names.
async fn holdings<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<Holding>, Refusal> {
  let rows = all(
    db,
    r#"SELECT h."user_id", h."role_id", h."concurrent", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name"
       FROM (
         SELECT ur."user_id", ur."role_id", false AS "concurrent"
           FROM "user_roles" ur JOIN "users" m ON m."id" = ur."user_id"
           WHERE m."organization_id" = $1
         UNION ALL
         SELECT up."user_id", up."role_id", true AS "concurrent"
           FROM "unit_posts" up WHERE up."unit_id" = $1::bigint AND up."role_id" IS NOT NULL
       ) h
       JOIN "users" u ON u."id" = h."user_id"
       WHERE NOT EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = h."user_id")
       ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), h."user_id""#,
    vec![unit.into()],
  )
  .await?;

  rows
    .iter()
    .map(|row| {
      Ok(Holding {
        user: i32::try_from(row.try_get::<i64>("", "user_id")?).unwrap_or_default(),
        name: row.try_get("", "name")?,
        role: row.try_get("", "role_id")?,
        concurrent: row.try_get("", "concurrent")?,
      })
    })
    .collect()
}

/// A unit's heads granted directly, each marked where the grant is an appointment's or stands through a post.
async fn heads_of<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<LineHead>, Refusal> {
  let sql = format!(
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name",
         {acting} AS "acting",
         EXISTS (SELECT 1 FROM "unit_posts" up WHERE up."user_id" = u."id" AND up."unit_id" = $1::bigint)
           AS "concurrent"
       FROM "users" u
       WHERE EXISTS (
         SELECT 1 FROM "relation_tuples" t
         WHERE t."resource_type" = '{UNIT}' AND t."resource_id" = $1::text AND t."relation" = '{HEAD_GRANT}'
           AND t."subject_type" = 'user' AND t."subject_id" = u."id"::text AND t."subject_relation" = ''
           AND (t."expires_at" IS NULL OR t."expires_at" > now()))
       ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), u."id""#,
    acting = acting_grant("$1::bigint", r#"u."id""#)
  );

  all(db, &sql, vec![unit.into()])
    .await?
    .iter()
    .map(|row| {
      Ok(LineHead {
        user: shown(row.try_get("", "id")?),
        name: row.try_get("", "name")?,
        acting: row.try_get("", "acting")?,
        concurrent: row.try_get("", "concurrent")?,
      })
    })
    .collect()
}

/// The units of a line from `unit` up, each with how it was reached, ending at the company or where the line would
/// come round.
async fn chain<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<(i32, LineVia)>, Refusal> {
  let mut steps = vec![(unit, LineVia::Start)];
  let mut seen = HashSet::from([unit]);
  let mut at = unit;

  while let Some((next, via)) = attributes::next_of(db, at).await? {
    if !seen.insert(next) {
      break;
    }

    steps.push((next, via));
    at = next;
  }

  Ok(steps)
}

async fn unit_name<C: ConnectionTrait>(db: &C, unit: i32) -> Result<String, Refusal> {
  Ok(
    crate::one(db, r#"SELECT "name" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
      .await?
      .map(|row| row.try_get::<String>("", "name"))
      .transpose()?
      .unwrap_or_default(),
  )
}

/// A unit's line, each step with its heads and the people holding each role there in the catalogue's order.
pub async fn line<C: ConnectionTrait>(db: &C, unit: i32, company: i32) -> Result<UnitLine, Refusal> {
  let catalogue = entries::<Roles, _>(db, company).await?;
  let mut steps = Vec::new();

  for (at, via) in chain(db, unit).await? {
    let attributes = attributes::of(db, at).await?;
    let holdings = holdings(db, at).await?;
    let roles = catalogue
      .iter()
      .filter_map(|role| {
        let holders: Vec<LineHolder> = holdings
          .iter()
          .filter(|holding| holding.role == role.id)
          .map(|holding| LineHolder {
            user: shown(holding.user),
            name: holding.name.clone(),
            concurrent: holding.concurrent,
          })
          .collect();

        (!holders.is_empty()).then(|| LineRole {
          role: role.role(),
          holders,
        })
      })
      .collect();

    steps.push(LineStep {
      unit: UnitRef {
        id: i64::from(at),
        name: unit_name(db, at).await?,
      },
      kind: attributes.kind,
      short_name: attributes.short_name,
      via,
      heads: heads_of(db, at).await?,
      roles,
    });
  }

  Ok(UnitLine { steps })
}

/// Who stands for `asked` for a unit: the holders at the nearest step holding it, else those of each lower role in
/// turn, marked acting with the reason, else nobody.
pub async fn stand<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  company: i32,
  asked: &Entry,
) -> Result<RoleStand, Refusal> {
  let catalogue = entries::<Roles, _>(db, company).await?;
  let mut candidates: Vec<&Entry> = catalogue.iter().filter(|role| role.place <= asked.place).collect();

  candidates.sort_by_key(|role| std::cmp::Reverse(role.place));

  let mut steps = Vec::new();

  for (at, _) in chain(db, unit).await? {
    steps.push((at, holdings(db, at).await?));
  }

  for role in candidates {
    for (at, holdings) in &steps {
      let held: Vec<&Holding> = holdings.iter().filter(|holding| holding.role == role.id).collect();

      if held.is_empty() {
        continue;
      }

      let unit = UnitRef {
        id: i64::from(*at),
        name: unit_name(db, *at).await?,
      };
      let acting = role.id != asked.id;

      return Ok(RoleStand {
        role: asked.role(),
        holders: held
          .into_iter()
          .map(|holding| RoleHolder {
            user: shown(holding.user),
            name: holding.name.clone(),
            unit: unit.clone(),
            concurrent: holding.concurrent,
          })
          .collect(),
        standing: Some(role.role()),
        acting,
        reason: acting.then_some(StandReason::NoHolder),
      });
    }
  }

  Ok(RoleStand {
    role: asked.role(),
    holders: Vec::new(),
    standing: None,
    acting: false,
    reason: None,
  })
}

async fn line_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
) -> Answer<UnitLine> {
  let reader = reader(&service.db, &headers).await?;
  let (unit, company) = reader.reached(&service.db, &unit).await?;

  Ok(Json(line(&service.db, unit, company).await?))
}

async fn stand_route(
  State(service): State<Service>,
  Path((unit, role)): Path<(String, String)>,
  headers: HeaderMap,
) -> Answer<RoleStand> {
  let reader = reader(&service.db, &headers).await?;
  let (unit, company) = reader.reached(&service.db, &unit).await?;
  let asked = entries::<Roles, _>(&service.db, company)
    .await?
    .into_iter()
    .find(|entry| entry.key == role)
    .ok_or_else(|| Refusal::absent(format!("the company keeps no role `{role}`")))?;

  Ok(Json(stand(&service.db, unit, company, &asked).await?))
}

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/units/{unit}/line", get(line_route))
    .route("/units/{unit}/line/{role}", get(stand_route))
}
