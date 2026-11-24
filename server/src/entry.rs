//! Who may let a person into a room or take them out (docs/accounts.md, 「A room's callers」): the administrator, the
//! room's leader — its opener, for a room opened in the console — or a head of the leader's unit, never across the
//! room's company. Membership is the call right; nothing is granted here, and the decision is read from the room's
//! leaders as the receiver answers them.

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::routing::post;
use bmo_web_client::{CheckAnswer, EntryCheckAsk};
use sea_orm::ConnectionTrait;
use sumida::api::authz::Authz;

use crate::ids::shown;
use crate::receiver::Receiver;
use crate::routes::{Answer, Body, user_in};
use crate::units::{company_of, heads, unit_of_user};
use crate::users::user_subject;
use crate::{Refusal, Service, one};

pub fn routes() -> Router<Service> {
  Router::new().route("/checks/entry", post(entry_check))
}

/// The decision an entry check asks for, as a refusal names it.
fn entry_grant(room: i64) -> String {
  format!("bmo_room:{room}#entry")
}

/// The company a room stands in: its first leader's that stands in one, none where no leader does.
async fn company_of_room<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  room: i64,
) -> Result<Option<i32>, Refusal> {
  for leader in receiver.leaders_of(room).await? {
    if let Some(company) = company_of_user(db, leader).await? {
      return Ok(Some(company));
    }
  }

  Ok(None)
}

/// Whether a user may let another into a room or take them out: never one of another company than the room's —
/// or, for a room with no leader, than the actor's, but for the administrator — and then the administrator, a
/// leader of the room, or a head of a leader's unit.
pub async fn may_let_in<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  actor: i32,
  room: i64,
  user: i32,
) -> Result<bool, Refusal> {
  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  let theirs = company_of_user(db, user).await?;
  let administrator = administrator(db, actor).await?;

  match company_of_room(db, receiver, room).await? {
    Some(company) if theirs != Some(company) => return Ok(false),
    None if !administrator && (theirs.is_none() || theirs != company_of_user(db, actor).await?) => {
      return Ok(false);
    }
    _ => {}
  }

  Ok(administrator || leads(db, receiver, actor, room).await?)
}

async fn entry_check(
  State(service): State<Service>,
  Body(ask): Body<EntryCheckAsk>,
) -> Answer<CheckAnswer> {
  let actor = user_in(&ask.actor)?;
  let user = user_in(&ask.user)?;

  Ok(Json(CheckAnswer {
    allowed: may_let_in(&service.db, service.receiver.as_ref(), actor, ask.room, user).await?,
    grant: entry_grant(ask.room),
    user: Some(shown(user)),
  }))
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
