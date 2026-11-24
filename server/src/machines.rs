//! An account's machine bound again or taken away (docs/accounts.md, 「Invitations and a person's machine」;
//! docs/boundary.md, 「Invitations」): the binding an invitation made moved to another machine by the administrator,
//! with that machine's credential and installs, proven once the hub holds it, declared shared where it stands, or
//! removed by the administrator or by the account itself, and a machine name bound to no account revoked at the hub.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{post, put};
use bmo_web_client::{Installs, MachineRevoked, NodeBinding, NodeSharing, OWNER_KEY, Rebound, UserNode};
use rand::RngCore;
use sea_orm::ConnectionTrait;

use crate::invites::node_of;
use crate::nodes::{Nodes, agent_of, attached_named};
use crate::routes::{Answer, Body, user_in};
use crate::units::administrator;
use crate::{Refusal, Service, now_ms, one, run};

/// The longest machine name the service binds an account to.
const LONGEST_NAME: usize = 63;

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/node", put(rebind_route).delete(unbind_route))
    .route("/users/{user}/node/proof", post(proof_route))
    .route("/users/{user}/node/shared", put(share_route))
    .route("/machines/{agent}/revoke", post(revoke_route))
}

/// A machine name an administrator named: letters, digits, `-` and `_`, as an install line carries it unquoted.
pub(crate) fn named(agent: &str) -> Result<String, Refusal> {
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

  // Another account's binding to the machine stands beside this one only where both declared it shared.
  if one(
    db,
    r#"SELECT 1 AS "one" FROM "user_nodes" WHERE "agent" = $1 AND "user_id" <> $2::bigint
       AND NOT ("shared" AND $3)"#,
    vec![agent.clone().into(), user.into(), binding.shared.into()],
  )
  .await?
  .is_some()
  {
    return Err(
      Refusal::new(
        StatusCode::CONFLICT,
        format!("another account is bound to the machine {agent}, and not both bindings are shared"),
      )
      .coded("node-taken"),
    );
  }

  let attached = attached_named(&nodes.hub.attached().await?, &agent).is_some();
  let proven_at = attached.then(now_ms);

  // Bound again to the machine it stands on, the account keeps the moment it was first connected to it.
  run(
    db,
    r#"INSERT INTO "user_nodes" ("user_id", "agent", "shared", "proven_at", "bound_at")
       VALUES ($1::bigint, $2, $3, $4, $5)
       ON CONFLICT ("user_id") DO UPDATE SET "agent" = EXCLUDED."agent", "shared" = EXCLUDED."shared",
       "proven_at" = EXCLUDED."proven_at",
       "bound_at" = CASE WHEN "user_nodes"."agent" = EXCLUDED."agent" THEN "user_nodes"."bound_at"
                         ELSE EXCLUDED."bound_at" END"#,
    vec![
      user.into(),
      agent.clone().into(),
      binding.shared.into(),
      proven_at.into(),
      now_ms().into(),
    ],
  )
  .await?;

  let (linux, windows) = nodes.installs(&agent);

  Ok(Rebound {
    credential: nodes.credential(&agent),
    agent,
    shared: binding.shared,
    hub_url: nodes.hub_url.clone(),
    install: Installs { linux, windows },
    attached,
  })
}

/// The account's machine declared shared with other accounts, or no longer shared, where it stands: the machine and
/// its proof are kept. Refused where the account is bound to none, and a declaration taken back while another account
/// is bound to the machine is refused `node-taken`, since that account's binding stands only beside a shared one.
pub async fn share<C: ConnectionTrait>(
  db: &C,
  nodes: &Nodes,
  user: i32,
  sharing: &NodeSharing,
) -> Result<UserNode, Refusal> {
  let agent = node_of(db, None, user)
    .await?
    .agent
    .ok_or_else(|| Refusal::absent(format!("user {user} is bound to no machine")))?;

  if !sharing.shared
    && one(
      db,
      r#"SELECT 1 AS "one" FROM "user_nodes" WHERE "agent" = $1 AND "user_id" <> $2::bigint"#,
      vec![agent.clone().into(), user.into()],
    )
    .await?
    .is_some()
  {
    return Err(
      Refusal::new(
        StatusCode::CONFLICT,
        format!("another account is bound to the machine {agent}, so it stays shared"),
      )
      .coded("node-taken"),
    );
  }

  run(
    db,
    r#"UPDATE "user_nodes" SET "shared" = $1 WHERE "user_id" = $2::bigint"#,
    vec![sharing.shared.into(), user.into()],
  )
  .await?;

  node_of(db, Some(nodes), user).await
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

/// A machine name revoked at the hub once no account is bound to it, so the machine under it is told to leave now or
/// at its next hello; refused `node-taken` while any account is still bound to the name, a shared binding among them.
pub async fn revoke<C: ConnectionTrait>(
  db: &C,
  nodes: &Nodes,
  agent: &str,
) -> Result<MachineRevoked, Refusal> {
  let agent = named(agent)?;

  if one(
    db,
    r#"SELECT 1 AS "one" FROM "user_nodes" WHERE "agent" = $1"#,
    vec![agent.clone().into()],
  )
  .await?
  .is_some()
  {
    return Err(
      Refusal::new(StatusCode::CONFLICT, format!("an account is still bound to the machine {agent}"))
        .coded("node-taken"),
    );
  }

  nodes.hub.revoke(&agent).await
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

/// The administrator, or the account itself as the console names it in `Owner-Key`: who may take an account's
/// machine away.
fn administrator_or_itself(headers: &HeaderMap, user: i32) -> Result<(), Refusal> {
  let itself = headers
    .get(OWNER_KEY)
    .and_then(|key| key.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    == Some(user);

  if itself {
    Ok(())
  } else {
    administrator(headers).map_err(|_| {
      Refusal::forbidden("an account's machine is taken away by the administrator or by the account itself")
    })
  }
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

async fn share_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
  Body(sharing): Body<NodeSharing>,
) -> Answer<UserNode> {
  administrator(&headers)?;
  let nodes = hub(&service)?;

  Ok(Json(share(&service.db, nodes, user_in(&user)?, &sharing).await?))
}

async fn unbind_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;

  administrator_or_itself(&headers, user)?;
  unbind(&service.db, user).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn proof_route(State(service): State<Service>, Path(user): Path<String>) -> Answer<UserNode> {
  let nodes = hub(&service)?;

  Ok(Json(prove(&service.db, nodes, user_in(&user)?).await?))
}

async fn revoke_route(State(service): State<Service>, Path(agent): Path<String>) -> Answer<MachineRevoked> {
  let nodes = hub(&service)?;

  Ok(Json(revoke(&service.db, nodes, &agent).await?))
}
