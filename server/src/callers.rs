//! A room's callers (docs/accounts.md, 「A room's callers」): the users granted `ask` on a room directly, set from
//! the console with no message to make the grant on, by the administrator, the room's leader or a head of the
//! user's unit, and never across companies but by the administrator.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use bmo_web_client::{OWNER_KEY, RoomCaller, RoomCallers};
use sea_orm::ConnectionTrait;
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleFilter, TupleWrite};

use crate::checks::ROOM;
use crate::ids::shown;
use crate::receiver::Receiver;
use crate::routes::{Answer, user_in};
use crate::units::{company_of, heads, unit_of_user};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one};

/// The relation a caller holds on the room.
const CALL: &str = "ask";
/// Who writes a caller's grant: the console's list of a room's callers.
const GRANTER: &str = "room-callers";

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/rooms/{chat}/callers", get(callers_route))
    .route("/rooms/{chat}/callers/{user}", axum::routing::put(grant_route).delete(revoke_route))
}

/// The signed-in user the call names, refused where it names none of this deployment.
async fn signed_in<C: ConnectionTrait>(db: &C, headers: &HeaderMap) -> Result<i32, Refusal> {
  let user = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    .ok_or_else(|| {
      Refusal::forbidden("a room's callers are read by a signed-in user, and the call names none")
    })?;

  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::forbidden("the call names no user of this deployment"))?;

  Ok(user)
}

fn room_in(asked: &str) -> Result<i64, Refusal> {
  asked.parse().map_err(|_| Refusal::bad(format!("`{asked}` is no room's number")))
}

async fn administrator<C: ConnectionTrait>(db: &C, user: i32) -> Result<bool, Refusal> {
  Ok(Authz::is_superuser(&user_subject(db, user).await?, db).await?)
}

/// The company a user stands in, where their unit stands in one.
async fn company_of_user<C: ConnectionTrait>(db: &C, user: i32) -> Result<Option<i32>, Refusal> {
  match unit_of_user(db, user).await? {
    Some(unit) => company_of(db, unit).await,
    None => Ok(None),
  }
}

/// The users granted `ask` on a room directly, with their names, in the order they were granted.
pub async fn callers_of<C: ConnectionTrait>(db: &C, room: i64) -> Result<Vec<RoomCaller>, Refusal> {
  let rows = all(
    db,
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name"
       FROM "relation_tuples" t
       JOIN "users" u ON u."id"::text = t."subject_id"
       WHERE t."resource_type" = $1 AND t."resource_id" = $2 AND t."relation" = $3
         AND t."subject_type" = 'user' AND t."subject_relation" = ''
         AND (t."expires_at" IS NULL OR t."expires_at" > now())
       ORDER BY t."id""#,
    vec![ROOM.into(), room.to_string().into(), CALL.into()],
  )
  .await?;

  rows
    .iter()
    .map(|row| {
      Ok(RoomCaller {
        user: shown(row.try_get::<i32>("", "id")?),
        name: row.try_get("", "name")?,
      })
    })
    .collect()
}

/// Whether the signed-in user may change whether a user calls in a room: the administrator always; the room's
/// leader or a head of the user's unit where both stand in one company.
async fn may_set<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  actor: i32,
  room: i64,
  user: i32,
) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  if administrator(db, actor).await? {
    return Ok(());
  }

  let company = company_of_user(db, actor).await?;

  if company.is_none() || company != company_of_user(db, user).await? {
    return Err(Refusal::forbidden(format!("user {user} stands in another company")));
  }

  if leads(db, receiver, actor, room).await? {
    return Ok(());
  }

  if let Some(unit) = unit_of_user(db, user).await?
    && heads(db, actor, unit).await?
  {
    return Ok(());
  }

  Err(Refusal::forbidden(format!(
    "a room's callers are set by the administrator, the room's leader or a head of the user's unit, and user \
     {actor} is none of them for user {user} in room {room}"
  )))
}

/// Whether a user leads a room or heads the unit it belongs to: the unit of a user who owns a supervisor the room
/// names, or one above it.
async fn leads<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  actor: i32,
  room: i64,
) -> Result<bool, Refusal> {
  for leader in receiver.leaders_of(room).await? {
    if leader == actor {
      return Ok(true);
    }

    if let Some(unit) = unit_of_user(db, leader).await?
      && heads(db, actor, unit).await?
    {
      return Ok(true);
    }
  }

  Ok(false)
}

/// A user made a caller of a room, or no longer one.
pub async fn set_caller<C: ConnectionTrait>(
  db: &C,
  room: i64,
  user: i32,
  caller: bool,
) -> Result<(), Refusal> {
  let object = room.to_string();

  if caller {
    Authz::write_unchecked(TupleWrite::new(ROOM, &object, CALL, SubjectKey::user(user)), GRANTER, db)
      .await?;
  } else {
    Authz::revoke_unchecked(
      TupleFilter::object(ROOM, &object).relations(&[CALL]).subject(SubjectKey::user(user)),
      db,
    )
    .await?;
  }

  Ok(())
}

async fn callers_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(asked): Path<String>,
) -> Answer<RoomCallers> {
  let actor = signed_in(&service.db, &headers).await?;
  let room = room_in(&asked)?;
  let may_change = administrator(&service.db, actor).await?
    || leads(&service.db, service.receiver.as_ref(), actor, room).await.unwrap_or(false);

  Ok(Json(RoomCallers {
    room,
    callers: callers_of(&service.db, room).await?,
    may_change,
  }))
}

async fn changed(
  service: Service,
  headers: HeaderMap,
  asked: String,
  user: String,
  caller: bool,
) -> Result<StatusCode, Refusal> {
  let actor = signed_in(&service.db, &headers).await?;
  let room = room_in(&asked)?;
  let user = user_in(&user)?;

  may_set(&service.db, service.receiver.as_ref(), actor, room, user).await?;
  set_caller(&service.db, room, user, caller).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn grant_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path((asked, user)): Path<(String, String)>,
) -> Result<StatusCode, Refusal> {
  changed(service, headers, asked, user, true).await
}

async fn revoke_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path((asked, user)): Path<(String, String)>,
) -> Result<StatusCode, Refusal> {
  changed(service, headers, asked, user, false).await
}
