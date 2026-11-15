//! Invitations and a person's machine (docs/accounts.md, 「Invitations and a person's machine」; docs/boundary.md,
//! 「Invitations」): a link that makes one disabled account in one unit, bound to the machine named after it, and the
//! account enabled once the jake hub holds that machine.

use std::collections::HashMap;

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use bmo_web_client::{
  AcceptAsk, Accepted, Installs, Invite, InviteAsk, InviteUnit, InviteUnits, InviteView, Invites,
  OWNER_KEY, OWNER_ROLE, Proof, UnitRef, UserNode,
};
use rand::RngCore;
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleWrite};

use crate::ids::shown;
use crate::nodes::{Nodes, agent_of};
use crate::routes::{Answer, Body, user_in};
use crate::units::{UNIT, every_unit, heads, path_of};
use crate::users::{default_role, hashed};
use crate::{Refusal, Service, all, now_ms, one, run};

/// How long an invitation stands open where the asker names no span, and the longest it may.
const DEFAULT_HOURS: i64 = 72;
const MOST_HOURS: i64 = 24 * 30;
/// Who grants an invited head.
const GRANTER: &str = "invitation";

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/invites", post(make_route).get(list_route))
    .route("/invites/units", get(units_route))
    .route("/invites/{token}", get(view_route).delete(drop_route))
    .route("/invites/{token}/accept", post(accept_route))
    .route("/invites/{token}/proof", post(proof_route))
    .route("/users/{user}/node", get(node_route))
}

/// The login the console names: its user and whether it is the administrator.
fn login(headers: &HeaderMap) -> Result<(i32, bool), Refusal> {
  let user = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    .ok_or_else(|| {
      Refusal::forbidden("an invitation is made by a signed-in user, and the call names none")
    })?;
  let administrator =
    headers.get(OWNER_ROLE).and_then(|value| value.to_str().ok()) == Some("administrator");

  Ok((user, administrator))
}

fn hub(service: &Service) -> Result<&Nodes, Refusal> {
  service.nodes.as_deref().ok_or_else(|| {
    Refusal::new(StatusCode::SERVICE_UNAVAILABLE, "no jake hub is set, so no machine can be proven")
      .coded("no-hub")
  })
}

fn fresh_token() -> String {
  let mut bytes = [0u8; 24];

  rand::rng().fill_bytes(&mut bytes);
  bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// A unit and its company, as references.
async fn unit_and_company<C: ConnectionTrait>(db: &C, unit: i32) -> Result<(UnitRef, UnitRef), Refusal> {
  let path = path_of(db, unit).await?;

  match (path.last().cloned(), path.first().cloned()) {
    (Some(own), Some(company)) => Ok((own, company)),
    _ => Err(Refusal::absent(format!("no unit {unit}"))),
  }
}

struct Stored {
  token: String,
  unit: i32,
  head: bool,
  made_by: i32,
  expires_at: i64,
  used_by: Option<i32>,
}

async fn stored<C: ConnectionTrait>(db: &C, token: &str) -> Result<Stored, Refusal> {
  let row = one(
    db,
    r#"SELECT "token", "unit_id", "head", "made_by", "expires_at", "used_by" FROM "user_invites" WHERE "token" = $1"#,
    vec![token.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent("no invitation has this token"))?;

  Ok(Stored {
    token: row.try_get("", "token")?,
    unit: i32::try_from(row.try_get::<i64>("", "unit_id")?).unwrap_or_default(),
    head: row.try_get("", "head")?,
    made_by: i32::try_from(row.try_get::<i64>("", "made_by")?).unwrap_or_default(),
    expires_at: row.try_get("", "expires_at")?,
    used_by: row.try_get::<Option<i64>>("", "used_by")?.and_then(|user| i32::try_from(user).ok()),
  })
}

fn state_of(invite: &Stored) -> &'static str {
  if invite.used_by.is_some() {
    "used"
  } else if invite.expires_at <= now_ms() {
    "expired"
  } else {
    "open"
  }
}

async fn as_invite<C: ConnectionTrait>(db: &C, invite: &Stored) -> Result<Invite, Refusal> {
  let (unit, company) = unit_and_company(db, invite.unit).await?;

  Ok(Invite {
    token: invite.token.clone(),
    unit,
    company,
    head: invite.head,
    expires_at: invite.expires_at,
  })
}

/// An invitation made: by the administrator for any unit, or by a head for their unit or one below, never a head's.
pub async fn make<C: ConnectionTrait>(
  db: &C,
  by: i32,
  administrator: bool,
  ask: &InviteAsk,
) -> Result<Invite, Refusal> {
  let unit =
    i32::try_from(ask.unit).map_err(|_| Refusal::bad(format!("{} is no unit's number", ask.unit)))?;

  if !administrator {
    if ask.head {
      return Err(Refusal::forbidden("only the administrator invites a unit's head"));
    }

    if !heads(db, by, unit).await? {
      return Err(Refusal::forbidden(format!("user {by} heads no unit at or above {unit}")));
    }
  }

  unit_and_company(db, unit).await?;
  let hours = ask.hours.unwrap_or(DEFAULT_HOURS).clamp(1, MOST_HOURS);
  let now = now_ms();
  let token = fresh_token();

  run(
    db,
    r#"INSERT INTO "user_invites" ("token", "unit_id", "head", "made_by", "created_at", "expires_at")
       VALUES ($1, $2::bigint, $3, $4::bigint, $5, $6)"#,
    vec![
      token.clone().into(),
      unit.into(),
      ask.head.into(),
      by.into(),
      now.into(),
      (now + hours * 3_600_000).into(),
    ],
  )
  .await?;

  as_invite(db, &stored(db, &token).await?).await
}

/// An invitation accepted: the account made disabled in its unit, a head where it says so, bound to its machine.
pub async fn accept<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  nodes: &Nodes,
  token: &str,
  ask: &AcceptAsk,
) -> Result<Accepted, Refusal> {
  let name = ask.name.trim();

  if name.is_empty() || ask.password.is_empty() {
    return Err(Refusal::bad("an account needs a name and a password"));
  }

  let txn = db.begin().await?;
  let invite = stored(&txn, token).await?;

  if state_of(&invite) != "open" {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the invitation is expired or used").coded("invite-closed"),
    );
  }

  if one(&txn, r#"SELECT "id" FROM "users" WHERE "username" = $1"#, vec![name.into()])
    .await?
    .is_some()
  {
    return Err(Refusal::new(StatusCode::CONFLICT, "another user holds this name").coded("name-taken"));
  }

  let role = default_role(&txn).await?;
  let user: i32 = one(
    &txn,
    r#"INSERT INTO "users" ("username", "password", "role_id", "organization_id", "is_admin", "is_enabled")
       VALUES ($1, $2, $3::bigint, $4::bigint, false, false) RETURNING "id""#,
    vec![name.into(), hashed(&ask.password)?.into(), role.into(), invite.unit.into()],
  )
  .await?
  .ok_or_else(|| Refusal::bad("the account was not made"))?
  .try_get("", "id")?;

  crate::sections::seed_defaults(&txn, user, GRANTER).await?;

  if invite.head {
    Authz::write_unchecked(
      TupleWrite::new(UNIT, &invite.unit.to_string(), "manager", SubjectKey::user(user)),
      GRANTER,
      &txn,
    )
    .await?;
  }

  let agent = agent_of(user);

  run(
    &txn,
    r#"INSERT INTO "user_nodes" ("user_id", "agent") VALUES ($1::bigint, $2)"#,
    vec![user.into(), agent.clone().into()],
  )
  .await?;
  run(
    &txn,
    r#"UPDATE "user_invites" SET "used_by" = $1::bigint, "used_at" = $2 WHERE "token" = $3"#,
    vec![user.into(), now_ms().into(), token.into()],
  )
  .await?;
  txn.commit().await?;

  let (linux, windows) = nodes.installs(&agent);

  Ok(Accepted {
    user: shown(user),
    credential: nodes.credential(&agent),
    agent,
    hub_url: nodes.hub_url.clone(),
    install: Installs { linux, windows },
  })
}

/// The machine an account is bound to, whether the hub holds it, and when it was last proven.
pub async fn node_of<C: ConnectionTrait>(
  db: &C,
  nodes: Option<&Nodes>,
  user: i32,
) -> Result<UserNode, Refusal> {
  let row = one(
    db,
    r#"SELECT "agent", "shared", "proven_at" FROM "user_nodes" WHERE "user_id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?;
  let left = one(
    db,
    r#"SELECT 1 AS "one" FROM "user_departures" WHERE "user_id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?
  .is_some();
  let Some(row) = row else {
    return Ok(UserNode {
      agent: None,
      shared: false,
      attached: false,
      proven_at: None,
      left,
    });
  };
  let agent: String = row.try_get("", "agent")?;
  let attached = match nodes {
    Some(nodes) => nodes.hub.attached().await?.contains(&agent),
    None => false,
  };

  Ok(UserNode {
    agent: Some(agent),
    shared: row.try_get("", "shared")?,
    attached,
    proven_at: row.try_get("", "proven_at")?,
    left,
  })
}

/// An invited account enabled once the hub holds its machine.
pub async fn prove<C: ConnectionTrait>(db: &C, nodes: &Nodes, token: &str) -> Result<Proof, Refusal> {
  let invite = stored(db, token).await?;
  let user = invite.used_by.ok_or_else(|| {
    Refusal::new(StatusCode::CONFLICT, "the invitation is not accepted yet").coded("invite-open")
  })?;
  let node = node_of(db, Some(nodes), user).await?;

  if !node.attached {
    return Ok(Proof {
      active: false,
      user: None,
    });
  }

  run(
    db,
    r#"UPDATE "users" SET "is_enabled" = true, "updated_at" = now() WHERE "id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?;
  run(
    db,
    r#"UPDATE "user_nodes" SET "proven_at" = $1 WHERE "user_id" = $2::bigint"#,
    vec![now_ms().into(), user.into()],
  )
  .await?;

  Ok(Proof {
    active: true,
    user: Some(shown(user)),
  })
}

async fn make_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<InviteAsk>,
) -> Result<(StatusCode, Json<Invite>), Refusal> {
  let (by, administrator) = login(&headers)?;
  hub(&service)?;

  Ok((StatusCode::CREATED, Json(make(&service.db, by, administrator, &ask).await?)))
}

async fn list_route(State(service): State<Service>, headers: HeaderMap) -> Answer<Invites> {
  let (by, administrator) = login(&headers)?;
  let rows = all(
    &service.db,
    r#"SELECT "token" FROM "user_invites"
       WHERE "used_by" IS NULL AND "expires_at" > $1 AND ($2 OR "made_by" = $3::bigint)
       ORDER BY "created_at" DESC"#,
    vec![now_ms().into(), administrator.into(), by.into()],
  )
  .await?;
  let mut invites = Vec::new();

  for row in &rows {
    let token: String = row.try_get("", "token")?;

    invites.push(as_invite(&service.db, &stored(&service.db, &token).await?).await?);
  }

  Ok(Json(Invites { invites }))
}

/// The units a login may invite into, each with its parent and its company, in the tree's order: every unit comes
/// after its parent, so its company is known by the time it is read.
async fn units_route(State(service): State<Service>, headers: HeaderMap) -> Answer<InviteUnits> {
  let (by, administrator) = login(&headers)?;
  let mut companies: HashMap<i64, UnitRef> = HashMap::new();
  let mut units = Vec::new();

  for unit in every_unit(&service.db).await? {
    let own = UnitRef {
      id: unit.id,
      name: unit.name.clone(),
    };
    let company = unit.parent.and_then(|parent| companies.get(&parent).cloned()).unwrap_or(own);

    companies.insert(unit.id, company.clone());

    if administrator || heads(&service.db, by, i32::try_from(unit.id).unwrap_or_default()).await? {
      units.push(InviteUnit {
        id: unit.id,
        name: unit.name,
        parent: unit.parent,
        company,
      });
    }
  }

  Ok(Json(InviteUnits { units }))
}

async fn drop_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(token): Path<String>,
) -> Result<StatusCode, Refusal> {
  let (by, administrator) = login(&headers)?;
  let invite = stored(&service.db, &token).await?;

  if !administrator && invite.made_by != by {
    return Err(Refusal::forbidden(
      "an invitation is taken back by whoever made it, or the administrator",
    ));
  }

  run(&service.db, r#"DELETE FROM "user_invites" WHERE "token" = $1"#, vec![token.into()]).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn view_route(State(service): State<Service>, Path(token): Path<String>) -> Answer<InviteView> {
  let invite = stored(&service.db, &token).await?;
  let (unit, company) = unit_and_company(&service.db, invite.unit).await?;

  Ok(Json(InviteView {
    unit,
    company,
    head: invite.head,
    expires_at: invite.expires_at,
    state: state_of(&invite).to_owned(),
  }))
}

async fn accept_route(
  State(service): State<Service>,
  Path(token): Path<String>,
  Body(ask): Body<AcceptAsk>,
) -> Result<(StatusCode, Json<Accepted>), Refusal> {
  let nodes = hub(&service)?;

  Ok((StatusCode::CREATED, Json(accept(&service.db, nodes, &token, &ask).await?)))
}

async fn proof_route(State(service): State<Service>, Path(token): Path<String>) -> Answer<Proof> {
  let nodes = hub(&service)?;

  Ok(Json(prove(&service.db, nodes, &token).await?))
}

async fn node_route(State(service): State<Service>, Path(user): Path<String>) -> Answer<UserNode> {
  Ok(Json(node_of(&service.db, service.nodes.as_deref(), user_in(&user)?).await?))
}
