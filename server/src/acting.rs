//! Acting for a unit's head (docs/accounts.md, 「Acting」; docs/boundary.md, 「Organisation units」): one person
//! named to act for a unit's head until a moment still to come. The standing is sumida's `manager` tuple on the
//! unit with that moment as its `expires_at`, so the unit check passes while it runs and fails after with no act
//! between; the service's own record of the appointment is the mark that the grant is an acting one, who named it
//! and when. A head grant with an end on a unit is an appointment's, and no other road writes one.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::put;
use bmo_web_client::{ActingFor, Appointment, AppointmentAsk, HistoryChange, UnitRef};
use chrono::{DateTime, Utc};
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleWrite};

use crate::history::{Change, record};
use crate::ids::shown;
use crate::readers::{Reader, reader};
use crate::routes::{Answer, Body, user_in};
use crate::units::{HEAD_GRANT, UNIT, company_of, heads_lastingly, unit_in, unit_of_user};
use crate::{Refusal, Service, all, now_ms, one, run};

/// Who writes an appointment's grant, as sumida keeps its writer.
const GRANTER: &str = "acting";

/// The condition that the person `user` names holds a running acting grant on the unit `unit` names, both SQL
/// expressions.
pub fn acting_grant(unit: &str, user: &str) -> String {
  format!(
    r#"EXISTS (
         SELECT 1 FROM "relation_tuples" ag
         WHERE ag."resource_type" = '{UNIT}' AND ag."resource_id" = ({unit})::text AND ag."relation" = '{HEAD_GRANT}'
           AND ag."subject_type" = 'user' AND ag."subject_id" = ({user})::text AND ag."subject_relation" = ''
           AND ag."expires_at" IS NOT NULL AND ag."expires_at" > now())"#
  )
}

/// Whether `user`'s appointment on `unit` runs.
pub async fn running_of<C: ConnectionTrait>(db: &C, unit: i32, user: i32) -> Result<bool, Refusal> {
  let sql = format!(r#"SELECT {} AS "running""#, acting_grant("$1::bigint", "$2::bigint"));

  Ok(
    one(db, &sql, vec![unit.into(), user.into()])
      .await?
      .map(|row| row.try_get::<bool>("", "running"))
      .transpose()?
      .unwrap_or(false),
  )
}

/// The appointment running on a unit, where one does.
pub async fn running_on<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Option<Appointment>, Refusal> {
  let sql = format!(
    r#"SELECT a."user_id", a."until", a."made_by", a."made_at"
       FROM "unit_appointments" a
       WHERE a."unit_id" = $1::bigint AND a."ended_at" IS NULL AND {}
       ORDER BY a."id" DESC
       LIMIT 1"#,
    acting_grant(r#"a."unit_id""#, r#"a."user_id""#)
  );

  one(db, &sql, vec![unit.into()])
    .await?
    .map(|row| -> Result<Appointment, Refusal> {
      let by: Option<i64> = row.try_get("", "made_by")?;

      Ok(Appointment {
        user: shown(i32::try_from(row.try_get::<i64>("", "user_id")?).unwrap_or_default()),
        until: row.try_get("", "until")?,
        by: by.map(|by| shown(i32::try_from(by).unwrap_or_default())),
        at: row.try_get("", "made_at")?,
      })
    })
    .transpose()
}

/// The appointments of a person running, each unit with its end, in the units' order.
pub async fn acting_for<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<ActingFor>, Refusal> {
  let sql = format!(
    r#"SELECT a."unit_id", o."name", max(a."until") AS "until"
       FROM "unit_appointments" a
       JOIN "organizations" o ON o."id" = a."unit_id"
       WHERE a."user_id" = $1::bigint AND a."ended_at" IS NULL AND {}
       GROUP BY a."unit_id", o."name"
       ORDER BY o."name", a."unit_id""#,
    acting_grant(r#"a."unit_id""#, r#"a."user_id""#)
  );

  all(db, &sql, vec![user.into()])
    .await?
    .iter()
    .map(|row| {
      Ok(ActingFor {
        unit: UnitRef {
          id: row.try_get("", "unit_id")?,
          name: row.try_get("", "name")?,
        },
        until: row.try_get("", "until")?,
      })
    })
    .collect()
}

/// `user`'s appointment on `unit` ended where one runs: its grant taken away, its record marked ended and the
/// end kept in their history. Answers whether one ran.
pub async fn end_of<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  user: i32,
  by: Option<i32>,
) -> Result<bool, Refusal> {
  if !running_of(db, unit, user).await? {
    return Ok(false);
  }

  run(
    db,
    r#"DELETE FROM "relation_tuples"
       WHERE "resource_type" = $1 AND "resource_id" = $2 AND "relation" = $3
         AND "subject_type" = 'user' AND "subject_id" = $4 AND "subject_relation" = ''
         AND "expires_at" IS NOT NULL"#,
    vec![UNIT.into(), unit.to_string().into(), HEAD_GRANT.into(), user.to_string().into()],
  )
  .await?;
  run(
    db,
    r#"UPDATE "unit_appointments" SET "ended_at" = $3, "ended_by" = $4::bigint
       WHERE "unit_id" = $1::bigint AND "user_id" = $2::bigint AND "ended_at" IS NULL"#,
    vec![unit.into(), user.into(), now_ms().into(), by.into()],
  )
  .await?;
  record(db, by, Change::new(user, HistoryChange::ActingEnded).unit(unit)).await?;

  Ok(true)
}

/// Every appointment of a person's that runs ended, as a person who leaves loses them.
pub async fn end_every<C: ConnectionTrait>(db: &C, user: i32, by: Option<i32>) -> Result<(), Refusal> {
  for running in acting_for(db, user).await? {
    let unit =
      i32::try_from(running.unit.id).map_err(|_| Refusal::bad("the unit's number is out of range"))?;

    end_of(db, unit, user, by).await?;
  }

  Ok(())
}

/// Whether the reader may appoint on a unit: the administrator, or a head of a unit above it.
async fn may_appoint<C: ConnectionTrait>(db: &C, reader: &Reader, unit: i32) -> Result<(), Refusal> {
  let parent: Option<i32> = one(
    db,
    r#"SELECT "parent_id" FROM "organizations" WHERE "id" = $1::bigint"#,
    vec![unit.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?
  .try_get("", "parent_id")?;
  let allowed = match parent {
    Some(parent) => reader.heads(db, parent).await?,
    None => reader.administrator,
  };

  if allowed {
    Ok(())
  } else {
    Err(Refusal::forbidden(
      "an acting appointment is made by the administrator or a head of a unit above",
    ))
  }
}

/// A person named to act for a unit's head until `until`: another person acting there ends, the same person's
/// end moves.
async fn appoint<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  user: i32,
  until: i64,
  by: Option<i32>,
) -> Result<(), Refusal> {
  let home = unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let left = one(db, r#"SELECT 1 FROM "user_departures" WHERE "user_id" = $1::bigint"#, vec![user.into()])
    .await?
    .is_some();

  if left {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "an account that has left acts for nobody").coded("left"),
    );
  }

  if company_of(db, home).await? != company_of(db, unit).await? {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "a person acts for a unit of their own company alone")
        .coded("other-company"),
    );
  }

  if until <= now_ms() {
    return Err(Refusal::bad("an appointment ends at a moment still to come").coded("bad-period"));
  }

  let end = DateTime::<Utc>::from_timestamp_millis(until)
    .ok_or_else(|| Refusal::bad("the appointment's end is no time").coded("bad-period"))?;

  if heads_lastingly(db, unit, user).await? {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the person is granted the unit's head already")
        .coded("already-head"),
    );
  }

  if let Some(running) = running_on(db, unit).await?
    && running.user != shown(user)
  {
    let other = user_in(&running.user)?;

    end_of(db, unit, other, by).await?;
  }

  let same = running_of(db, unit, user).await?;

  Authz::write_unchecked(
    TupleWrite::new(UNIT, &unit.to_string(), HEAD_GRANT, SubjectKey::user(user)).expiring(end),
    GRANTER,
    db,
  )
  .await?;

  if same {
    run(
      db,
      r#"UPDATE "unit_appointments" SET "until" = $3
         WHERE "unit_id" = $1::bigint AND "user_id" = $2::bigint AND "ended_at" IS NULL"#,
      vec![unit.into(), user.into(), until.into()],
    )
    .await?;
  } else {
    run(
      db,
      r#"UPDATE "unit_appointments" SET "ended_at" = $3
         WHERE "unit_id" = $1::bigint AND "user_id" = $2::bigint AND "ended_at" IS NULL"#,
      vec![unit.into(), user.into(), now_ms().into()],
    )
    .await?;
    run(
      db,
      r#"INSERT INTO "unit_appointments" ("unit_id", "user_id", "until", "made_by", "made_at")
         VALUES ($1::bigint, $2::bigint, $3, $4::bigint, $5)"#,
      vec![unit.into(), user.into(), until.into(), by.into(), now_ms().into()],
    )
    .await?;
  }

  record(db, by, Change::new(user, HistoryChange::Acting).unit(unit).until(until)).await
}

async fn appoint_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<AppointmentAsk>,
) -> Answer<Appointment> {
  let reader = reader(&service.db, &headers).await?;
  let unit = unit_in(&unit)?;
  let user = user_in(&ask.user)?;

  may_appoint(&service.db, &reader, unit).await?;

  let txn = service.db.begin().await?;

  match appoint(&txn, unit, user, ask.until, Some(reader.user)).await {
    Ok(()) => txn.commit().await?,
    Err(refused) => {
      txn.rollback().await?;

      return Err(refused);
    }
  }

  running_on(&service.db, unit)
    .await?
    .map(Json)
    .ok_or_else(|| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, "the appointment does not run"))
}

async fn end_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let reader = reader(&service.db, &headers).await?;
  let unit = unit_in(&unit)?;

  may_appoint(&service.db, &reader, unit).await?;

  if let Some(running) = running_on(&service.db, unit).await? {
    end_of(&service.db, unit, user_in(&running.user)?, Some(reader.user)).await?;
  }

  Ok(StatusCode::NO_CONTENT)
}

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new().route("/units/{unit}/acting", put(appoint_route).delete(end_route))
}
