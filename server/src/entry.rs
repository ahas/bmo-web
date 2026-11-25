//! Who may let a person into a room or take them out (docs/accounts.md, 「A room's callers」): the administrator, the
//! room's leader — its opener, for a room opened in the console — or a head of the leader's unit, and for letting in
//! every member of the room besides, never across the room's company. Membership is the call right; nothing is
//! granted here, and the decision is read from the room's leaders and members as the receiver answers them.

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::routing::post;
use bmo_web_client::{CheckAnswer, EntryAct, EntryCheckAsk};
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

/// The people one reader may act on within a room, as one rule read for both the entry check and the list of
/// the people a room search named for it answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryBound {
  /// The reader may act on nobody in the room.
  NoOne,
  /// The reader may act on the people standing in this company.
  Company(i32),
  /// The reader may act on every person of the deployment.
  Everyone,
}

/// Which people `act` reaches for `actor` in `room`: whether it reaches anybody at all is the actor's standing
/// in the room — the administrator, a leader of the room or a head of a leader's unit for either act, and every
/// member of the room for letting in; and which company it is bounded to is the room's own company, or the
/// actor's for a room standing with no leader, the administrator unbounded there.
pub async fn entry_set<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  actor: i32,
  room: i64,
  act: EntryAct,
) -> Result<EntryBound, Refusal> {
  let administrator = administrator(db, actor).await?;
  let leads = leads(db, receiver, actor, room).await?;
  let member = receiver.members_of(room).await?.contains(&actor);
  let allowed = administrator || leads || (act == EntryAct::LetIn && member);

  match company_of_room(db, receiver, room).await? {
    Some(company) if allowed => Ok(EntryBound::Company(company)),
    Some(_) => Ok(EntryBound::NoOne),
    None if administrator => Ok(EntryBound::Everyone),
    None if !allowed => Ok(EntryBound::NoOne),
    None => Ok(match company_of_user(db, actor).await? {
      Some(company) => EntryBound::Company(company),
      None => EntryBound::NoOne,
    }),
  }
}

/// Whether a user may let another into a room or take them out, as `act` asks: the act must reach at all for
/// the actor — its standing in the room, as `entry_set` reads it — and the person must stand within the bound
/// it reaches, which is never a person of another company than the room's, or, for a room with no leader, than
/// the actor's, but for the administrator.
pub async fn may_enter<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  actor: i32,
  room: i64,
  user: i32,
  act: EntryAct,
) -> Result<bool, Refusal> {
  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok(match entry_set(db, receiver, actor, room, act).await? {
    EntryBound::NoOne => false,
    EntryBound::Company(company) => company_of_user(db, user).await? == Some(company),
    EntryBound::Everyone => true,
  })
}

async fn entry_check(
  State(service): State<Service>,
  Body(ask): Body<EntryCheckAsk>,
) -> Answer<CheckAnswer> {
  let actor = user_in(&ask.actor)?;
  let user = user_in(&ask.user)?;

  Ok(Json(CheckAnswer {
    allowed: may_enter(&service.db, service.receiver.as_ref(), actor, ask.room, user, ask.act).await?,
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
