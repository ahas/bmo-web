//! A machine shared at an invitation's ask (docs/accounts.md, 「A machine shared at an invitation's ask」;
//! docs/boundary.md, 「Invitations」): an invited account whose person's PC already serves another machine name asks to
//! share that machine, bound at once where the asking browser's account is bound to it, and otherwise decided by the
//! administrator or by a head whose units hold the asking account and every account on the machine.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use bmo_web_client::{
  NodeBinding, ShareAnswer, ShareAsk, ShareAskRow, ShareAskState, ShareAsks, ShareHolder,
};
use sea_orm::{ConnectionTrait, TransactionTrait};

use crate::ids::{parsed, shown};
use crate::invites::{account_of, login, node_of, unit_and_company, waiting_account};
use crate::machines::{named, rebind};
use crate::nodes::{Nodes, attached_named};
use crate::routes::{Answer, Body, user_in};
use crate::units::heads;
use crate::{Refusal, Service, all, now_ms, one, run};

const ASKED: &str = "asked";
const APPROVED: &str = "approved";
const REFUSED: &str = "refused";
/// The answer of a share bound, at once or by a decision.
const BOUND: &str = "bound";

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/invites/{token}/share", post(ask_route).get(state_route))
    .route("/machine-shares", get(list_route))
    .route("/machine-shares/{user}/approve", post(approve_route))
    .route("/machine-shares/{user}/refuse", post(refuse_route))
}

fn hub(service: &Service) -> Result<&Nodes, Refusal> {
  service.nodes.as_deref().ok_or_else(|| {
    Refusal::new(StatusCode::SERVICE_UNAVAILABLE, "no jake hub is set, so no machine can be shared")
      .coded("no-hub")
  })
}

/// The accounts bound to a machine, by their ids.
async fn bound_to<C: ConnectionTrait>(db: &C, agent: &str) -> Result<Vec<i32>, Refusal> {
  let rows = all(
    db,
    r#"SELECT "user_id" FROM "user_nodes" WHERE "agent" = $1 ORDER BY "user_id""#,
    vec![agent.into()],
  )
  .await?;

  rows
    .iter()
    .map(|row| Ok(i32::try_from(row.try_get::<i64>("", "user_id")?).unwrap_or_default()))
    .collect()
}

/// The share bound: every account already on the machine declared shared, and the asking account bound to it
/// shared, proven at once where the hub holds it. The answer names the accounts already on it.
async fn bind<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  nodes: &Nodes,
  user: i32,
  agent: &str,
  decided_by: i32,
) -> Result<ShareAnswer, Refusal> {
  let txn = db.begin().await?;
  let holders: Vec<i32> =
    bound_to(&txn, agent).await?.into_iter().filter(|holder| *holder != user).collect();

  run(
    &txn,
    r#"UPDATE "user_nodes" SET "shared" = true WHERE "agent" = $1 AND "user_id" <> $2::bigint"#,
    vec![agent.into(), user.into()],
  )
  .await?;
  rebind(
    &txn,
    nodes,
    user,
    &NodeBinding {
      agent: Some(agent.to_owned()),
      shared: true,
    },
  )
  .await?;
  run(
    &txn,
    r#"UPDATE "machine_share_asks" SET "state" = $1, "decided_by" = $2::bigint, "decided_at" = $3
       WHERE "user_id" = $4::bigint"#,
    vec![APPROVED.into(), decided_by.into(), now_ms().into(), user.into()],
  )
  .await?;
  txn.commit().await?;

  Ok(ShareAnswer {
    machine: agent.to_owned(),
    state: BOUND.to_owned(),
    holders: holders.into_iter().map(shown).collect(),
  })
}

/// An invited account's ask to share the machine named: refused where the hub holds no agent of that name, bound at
/// once where `owner`, the account the asking browser is signed in to, is bound to it, and kept to be decided
/// otherwise, replacing the account's earlier ask.
pub async fn ask<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  nodes: &Nodes,
  token: &str,
  asked: &ShareAsk,
) -> Result<ShareAnswer, Refusal> {
  let user = waiting_account(db, token).await?;
  let agent = named(&asked.machine)?;

  if attached_named(&nodes.hub.attached().await?, &agent).is_none() {
    return Err(
      Refusal::absent(format!("the hub holds no machine named {agent}, so there is nothing to share"))
        .coded("no-machine"),
    );
  }

  run(
    db,
    r#"INSERT INTO "machine_share_asks" ("user_id", "agent", "asked_at", "state") VALUES ($1::bigint, $2, $3, $4)
       ON CONFLICT ("user_id") DO UPDATE SET "agent" = EXCLUDED."agent", "asked_at" = EXCLUDED."asked_at",
       "state" = EXCLUDED."state", "decided_by" = NULL, "decided_at" = NULL"#,
    vec![user.into(), agent.clone().into(), now_ms().into(), ASKED.into()],
  )
  .await?;

  if let Some(owner) = asked.owner.as_deref().and_then(parsed).filter(|owner| *owner != user)
    && bound_to(db, &agent).await?.contains(&owner)
    && !node_of(db, None, owner).await?.left
  {
    return bind(db, nodes, user, &agent, owner).await;
  }

  Ok(ShareAnswer {
    machine: agent,
    state: ASKED.to_owned(),
    holders: Vec::new(),
  })
}

/// The invitation's account's ask, as it stands.
pub async fn state<C: ConnectionTrait>(db: &C, token: &str) -> Result<ShareAskState, Refusal> {
  let user = account_of(db, token).await?;
  let row = one(
    db,
    r#"SELECT "agent", "asked_at", "state" FROM "machine_share_asks" WHERE "user_id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent("the invitation's account asked to share no machine"))?;

  Ok(ShareAskState {
    machine: row.try_get("", "agent")?,
    asked_at: row.try_get("", "asked_at")?,
    state: row.try_get("", "state")?,
  })
}

/// The unit an account stands in, none where it stands in none.
async fn unit_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Option<i32>, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT "organization_id" FROM "users" WHERE "id" = $1::bigint"#,
      vec![user.into()],
    )
    .await?
    .map(|row| row.try_get::<Option<i32>>("", "organization_id"))
    .transpose()?
    .flatten(),
  )
}

/// Whether a head heads the unit an account stands in.
async fn heads_account<C: ConnectionTrait>(db: &C, by: i32, user: i32) -> Result<bool, Refusal> {
  match unit_of(db, user).await? {
    Some(unit) => heads(db, by, unit).await,
    None => Ok(false),
  }
}

/// Whether the reader may decide an account's ask for a machine: the administrator any, and a head one whose asking
/// account and every account on the machine stand in units they head; a machine on no account is the
/// administrator's alone.
async fn may_decide<C: ConnectionTrait>(
  db: &C,
  by: i32,
  administrator: bool,
  user: i32,
  agent: &str,
) -> Result<bool, Refusal> {
  if administrator {
    return Ok(true);
  }

  if !heads_account(db, by, user).await? {
    return Ok(false);
  }

  let holders: Vec<i32> = bound_to(db, agent).await?.into_iter().filter(|holder| *holder != user).collect();

  if holders.is_empty() {
    return Ok(false);
  }

  for holder in holders {
    if !heads_account(db, by, holder).await? {
      return Ok(false);
    }
  }

  Ok(true)
}

/// An account as a share's decider reads it: its id, login and the person's name.
async fn holder_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<ShareHolder, Refusal> {
  let row = one(
    db,
    r#"SELECT "username", "full_name" FROM "users" WHERE "id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok(ShareHolder {
    user: shown(user),
    login: row.try_get("", "username")?,
    full_name: row.try_get::<Option<String>>("", "full_name")?.unwrap_or_default(),
  })
}

/// The asks waiting for a decision the reader may make, oldest first.
pub async fn waiting<C: ConnectionTrait>(
  db: &C,
  by: i32,
  administrator: bool,
) -> Result<ShareAsks, Refusal> {
  let rows = all(
    db,
    r#"SELECT "user_id", "agent", "asked_at" FROM "machine_share_asks" WHERE "state" = $1 ORDER BY "asked_at""#,
    vec![ASKED.into()],
  )
  .await?;
  let mut asks = Vec::new();

  for row in &rows {
    let user = i32::try_from(row.try_get::<i64>("", "user_id")?).unwrap_or_default();
    let agent: String = row.try_get("", "agent")?;

    if !may_decide(db, by, administrator, user, &agent).await? {
      continue;
    }

    let Some(unit) = unit_of(db, user).await? else { continue };
    let (unit, company) = unit_and_company(db, unit).await?;
    let person = holder_of(db, user).await?;
    let mut holders = Vec::new();

    for holder in bound_to(db, &agent).await? {
      if holder != user {
        holders.push(holder_of(db, holder).await?);
      }
    }

    asks.push(ShareAskRow {
      user: person.user,
      login: person.login,
      full_name: person.full_name,
      unit,
      company,
      machine: agent,
      holders,
      asked_at: row.try_get("", "asked_at")?,
    });
  }

  Ok(ShareAsks { asks })
}

/// The machine an account's waiting ask names, once the reader is known to may decide it.
async fn decidable<C: ConnectionTrait>(
  db: &C,
  by: i32,
  administrator: bool,
  user: i32,
) -> Result<String, Refusal> {
  let agent: String = one(
    db,
    r#"SELECT "agent" FROM "machine_share_asks" WHERE "user_id" = $1::bigint AND "state" = $2"#,
    vec![user.into(), ASKED.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("user {user} has no ask to share a machine waiting")))?
  .try_get("", "agent")?;

  if !may_decide(db, by, administrator, user, &agent).await? {
    return Err(Refusal::forbidden(format!(
      "an ask to share {agent} is decided by the administrator or a head of every account on it"
    )));
  }

  Ok(agent)
}

/// An ask approved: the share bound.
pub async fn approve<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  nodes: &Nodes,
  by: i32,
  administrator: bool,
  user: i32,
) -> Result<ShareAnswer, Refusal> {
  let agent = decidable(db, by, administrator, user).await?;

  bind(db, nodes, user, &agent, by).await
}

/// An ask refused.
pub async fn refuse<C: ConnectionTrait>(
  db: &C,
  by: i32,
  administrator: bool,
  user: i32,
) -> Result<(), Refusal> {
  decidable(db, by, administrator, user).await?;
  run(
    db,
    r#"UPDATE "machine_share_asks" SET "state" = $1, "decided_by" = $2::bigint, "decided_at" = $3
       WHERE "user_id" = $4::bigint"#,
    vec![REFUSED.into(), by.into(), now_ms().into(), user.into()],
  )
  .await?;

  Ok(())
}

async fn ask_route(
  State(service): State<Service>,
  Path(token): Path<String>,
  Body(asked): Body<ShareAsk>,
) -> Answer<ShareAnswer> {
  let nodes = hub(&service)?;

  Ok(Json(ask(&service.db, nodes, &token, &asked).await?))
}

async fn state_route(State(service): State<Service>, Path(token): Path<String>) -> Answer<ShareAskState> {
  Ok(Json(state(&service.db, &token).await?))
}

async fn list_route(State(service): State<Service>, headers: HeaderMap) -> Answer<ShareAsks> {
  let (by, administrator) = login(&headers)?;

  Ok(Json(waiting(&service.db, by, administrator).await?))
}

async fn approve_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Answer<ShareAnswer> {
  let (by, administrator) = login(&headers)?;
  let nodes = hub(&service)?;

  Ok(Json(approve(&service.db, nodes, by, administrator, user_in(&user)?).await?))
}

async fn refuse_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Result<StatusCode, Refusal> {
  let (by, administrator) = login(&headers)?;

  refuse(&service.db, by, administrator, user_in(&user)?).await?;

  Ok(StatusCode::NO_CONTENT)
}
