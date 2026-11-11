//! An account's machine bound again or taken away by the administrator (docs/accounts.md, 「Invitations and a
//! person's machine」; docs/boundary.md, 「Invitations」): the binding an invitation made moved to another machine,
//! with that machine's credential and installs, proven once the hub holds it, or removed.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{post, put};
use bmo_web_client::{Installs, NodeBinding, Rebound, UserNode};
use rand::RngCore;
use sea_orm::ConnectionTrait;

use crate::invites::node_of;
use crate::nodes::{Nodes, agent_of};
use crate::routes::{Answer, Body, user_in};
use crate::units::administrator;
use crate::{Refusal, Service, now_ms, one, run};

/// The longest machine name the service binds an account to.
const LONGEST_NAME: usize = 63;

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/node", put(rebind_route).delete(unbind_route))
    .route("/users/{user}/node/proof", post(proof_route))
}

/// A machine name an administrator named: letters, digits, `-` and `_`, as an install line carries it unquoted.
fn named(agent: &str) -> Result<String, Refusal> {
  let agent = agent.trim();
  let fits = !agent.is_empty()
    && agent.len() <= LONGEST_NAME
    && agent.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');

  if fits {
    Ok(agent.to_owned())
  } else {
    Err(Refusal::bad(format!(
      "a machine's name is 1 to {LONGEST_NAME} letters, digits, `-` and `_`, and `{agent}` is not"
    )))
  }
}

/// A machine name no earlier binding of the account used: its first name with a random tail, so a credential
/// handed out for a machine the account was bound to before proves nothing now.
fn fresh_name(user: i32) -> String {
  let mut bytes = [0u8; 4];

  rand::rng().fill_bytes(&mut bytes);
  let tail: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();

  format!("{}-{tail}", agent_of(user))
}

async fn user_exists<C: ConnectionTrait>(db: &C, user: i32) -> Result<(), Refusal> {
  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1::bigint"#, vec![user.into()])
    .await?
    .map(|_| ())
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))
}

/// An account bound to another machine: the one named, or a fresh name where none is. The binding is proven at
/// once where the hub already holds the machine, and otherwise waits for it.
pub async fn rebind<C: ConnectionTrait>(
  db: &C,
  nodes: &Nodes,
  user: i32,
  binding: &NodeBinding,
) -> Result<Rebound, Refusal> {
  user_exists(db, user).await?;

  if node_of(db, None, user).await?.left {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the account has left, so it is bound to no machine again")
        .coded("left"),
    );
  }

  let agent = match &binding.agent {
    Some(agent) => named(agent)?,
    None => fresh_name(user),
  };

  if one(
    db,
    r#"SELECT 1 AS "one" FROM "user_nodes" WHERE "agent" = $1 AND "user_id" <> $2::bigint"#,
    vec![agent.clone().into(), user.into()],
  )
  .await?
  .is_some()
  {
    return Err(
      Refusal::new(StatusCode::CONFLICT, format!("another account is bound to the machine {agent}"))
        .coded("node-taken"),
    );
  }

  let attached = nodes.hub.attached().await?.contains(&agent);
  let proven_at = attached.then(now_ms);

  run(
    db,
    r#"INSERT INTO "user_nodes" ("user_id", "agent", "proven_at") VALUES ($1::bigint, $2, $3)
       ON CONFLICT ("user_id") DO UPDATE SET "agent" = EXCLUDED."agent", "proven_at" = EXCLUDED."proven_at""#,
    vec![user.into(), agent.clone().into(), proven_at.into()],
  )
  .await?;

  let (linux, windows) = nodes.installs(&agent);

  Ok(Rebound {
    credential: nodes.credential(&agent),
    agent,
    hub_url: nodes.hub_url.clone(),
    install: Installs { linux, windows },
    attached,
  })
}

/// An account bound to no machine any more; refused where it is bound to none.
pub async fn unbind<C: ConnectionTrait>(db: &C, user: i32) -> Result<(), Refusal> {
  let removed = one(
    db,
    r#"DELETE FROM "user_nodes" WHERE "user_id" = $1::bigint RETURNING "agent""#,
    vec![user.into()],
  )
  .await?;

  removed
    .map(|_| ())
    .ok_or_else(|| Refusal::absent(format!("user {user} is bound to no machine")))
}

/// The account's machine as the hub holds it now, the moment recorded as its proof where the hub holds it.
pub async fn prove<C: ConnectionTrait>(db: &C, nodes: &Nodes, user: i32) -> Result<UserNode, Refusal> {
  let mut node = node_of(db, Some(nodes), user).await?;

  if node.attached {
    let now = now_ms();

    run(
      db,
      r#"UPDATE "user_nodes" SET "proven_at" = $1 WHERE "user_id" = $2::bigint"#,
      vec![now.into(), user.into()],
    )
    .await?;
    node.proven_at = Some(now);
  }

  Ok(node)
}

fn hub(service: &Service) -> Result<&Nodes, Refusal> {
  service.nodes.as_deref().ok_or_else(|| {
    Refusal::new(StatusCode::SERVICE_UNAVAILABLE, "no jake hub is set, so no machine can be bound")
      .coded("no-hub")
  })
}

async fn rebind_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
  Body(binding): Body<NodeBinding>,
) -> Answer<Rebound> {
  administrator(&headers)?;
  let nodes = hub(&service)?;

  Ok(Json(rebind(&service.db, nodes, user_in(&user)?, &binding).await?))
}

async fn unbind_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers)?;
  unbind(&service.db, user_in(&user)?).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn proof_route(State(service): State<Service>, Path(user): Path<String>) -> Answer<UserNode> {
  let nodes = hub(&service)?;

  Ok(Json(prove(&service.db, nodes, user_in(&user)?).await?))
}
