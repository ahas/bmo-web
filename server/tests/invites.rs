//! Invitations and a person's machine (docs/accounts.md, 「Invitations and a person's machine」): who invites into
//! which unit, read with its parent and its company, an invitation into a unit at any depth or into the company itself
//! accepted into that unit with its role, an invitation the table already holds taken as it was made, an invitation
//! that is closed opens nothing, acceptance makes a disabled account bound to its machine
//! with a credential made for that name, the account is enabled once the hub holds the machine, and the
//! administrator binds an account to another machine or takes its machine away.

use std::sync::{Arc, Mutex};

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::Refusal;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::nodes::{NodeHub, Nodes};
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::users::{ORGANIZATION, set_sign_in};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

#[derive(Default)]
struct StandInHub(Mutex<Vec<String>>);

#[async_trait::async_trait]
impl NodeHub for StandInHub {
  async fn attached(&self) -> Result<Vec<String>, Refusal> {
    Ok(self.0.lock().unwrap().clone())
  }
}

struct Stood {
  app: Router,
  hub: Arc<StandInHub>,
  scratch: Scratch,
  company: i32,
  team: i32,
  head: i32,
  member: i32,
}

async fn stood() -> Stood {
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![ROOM],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();
  let made = |name: &'static str, parent: Option<i32>| {
    let db = scratch.db().clone();
    async move {
      one(
        &db,
        r#"INSERT INTO "organizations" ("name", "parent_id") VALUES ($1, $2) RETURNING "id""#,
        vec![name.into(), parent.into()],
      )
      .await
      .unwrap()
      .unwrap()
      .try_get::<i32>("", "id")
      .unwrap()
    }
  };
  let company = made("company-a", None).await;
  let team = made("team-a", Some(company)).await;
  let head = set_sign_in(scratch.db(), "head-a", "the password", false).await.unwrap().user;
  let member = set_sign_in(scratch.db(), "member-a", "the password", false).await.unwrap().user;

  for user in [head, member] {
    scratch
      .run(
        r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
        vec![team.into(), user.into()],
      )
      .await;
  }
  scratch
    .run(
      r#"INSERT INTO "relation_tuples" ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
         VALUES ('organization', $1, 'manager', 'user', $2, '')"#,
      vec![team.to_string().into(), head.to_string().into()],
    )
    .await;
  let hub = Arc::new(StandInHub::default());
  let nodes = Nodes {
    hub: hub.clone(),
    hub_url: "wss://hub.invalid".into(),
    install_base: "https://install.invalid/jake".into(),
    agent_key: "agent-key".into(),
  };
  let app = in_force(scratch.service.clone().with_nodes(nodes), TOKEN.into()).await.unwrap();

  Stood {
    app,
    hub,
    scratch,
    company,
    team,
    head,
    member,
  }
}

async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  login: Option<(i32, &str)>,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header(header::CONTENT_TYPE, "application/json");

  if let Some((user, role)) = login {
    request = request.header("owner-key", user.to_string()).header("owner-role", role);
  }

  let body = body.map(|body| Body::from(body.to_string())).unwrap_or_else(Body::empty);
  let answer = app.clone().oneshot(request.body(body).unwrap()).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();

  (
    status,
    if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() },
  )
}

#[tokio::test]
async fn a_head_invites_a_member_into_their_unit_and_no_one_else_does() {
  ready();
  let stood = stood().await;
  let body = json!({ "unit": stood.team, "head": false, "hours": 2 });
  let (status, invite) =
    asked(&stood.app, Method::POST, "/invites", Some(body.clone()), Some((stood.head, "member"))).await;

  assert_eq!(status, StatusCode::CREATED, "{invite}");
  assert_eq!(invite["unit"]["id"], stood.team);
  assert_eq!(invite["company"]["name"], "company-a");

  // A member heads nothing; a head invites no head.
  let (status, said) =
    asked(&stood.app, Method::POST, "/invites", Some(body), Some((stood.member, "member"))).await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  let (status, said) = asked(
    &stood.app,
    Method::POST,
    "/invites",
    Some(json!({ "unit": stood.team, "head": true })),
    Some((stood.head, "member")),
  )
  .await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // The head lists it, and reads their unit, with its parent and its company, as all they may invite into.
  let (_, listed) = asked(&stood.app, Method::GET, "/invites", None, Some((stood.head, "member"))).await;
  assert_eq!(listed["invites"].as_array().unwrap().len(), 1, "{listed}");
  let (_, units) =
    asked(&stood.app, Method::GET, "/invites/units", None, Some((stood.head, "member"))).await;
  assert_eq!(
    units["units"],
    json!([{ "id": stood.team, "name": "team-a", "parent": stood.company,
             "company": { "id": stood.company, "name": "company-a" } }]),
  );
}

/// An invitation accepted, answering the account it made.
async fn accepted_as(stood: &Stood, token: &str, name: &str) -> i32 {
  let (status, accepted) = asked(
    &stood.app,
    Method::POST,
    &format!("/invites/{token}/accept"),
    Some(json!({ "name": name, "password": "pw" })),
    None,
  )
  .await;
  assert_eq!(status, StatusCode::CREATED, "{accepted}");

  accepted["user"].as_str().unwrap().parse().unwrap()
}

/// The unit an account stands in.
async fn unit_of(stood: &Stood, user: i32) -> i32 {
  one(
    stood.scratch.db(),
    r#"SELECT "organization_id" FROM "users" WHERE "id" = $1"#,
    vec![user.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "organization_id")
  .unwrap()
}

/// Whether a user heads a unit, through a grant on it or above it.
async fn heads(stood: &Stood, user: i32, unit: i32) -> bool {
  let (_, check) = asked(
    &stood.app,
    Method::POST,
    "/checks/unit",
    Some(json!({ "unit": unit, "user": user.to_string() })),
    None,
  )
  .await;

  check["allowed"].as_bool().unwrap()
}

#[tokio::test]
async fn an_invitation_into_a_nested_unit_or_the_company_takes_the_person_in_there_with_its_role() {
  ready();
  let stood = stood().await;
  let made = |name: &'static str, parent: i32| {
    let db = stood.scratch.db().clone();
    async move {
      one(
        &db,
        r#"INSERT INTO "organizations" ("name", "parent_id") VALUES ($1, $2) RETURNING "id""#,
        vec![name.into(), parent.into()],
      )
      .await
      .unwrap()
      .unwrap()
      .try_get::<i32>("", "id")
      .unwrap()
    }
  };
  let part = made("part-a", stood.team).await;
  let cell = made("cell-a", part).await;

  // The administrator reads the unit three levels down after its parent, under its company.
  let (_, units) = asked(&stood.app, Method::GET, "/invites/units", None, Some((1, "administrator"))).await;
  let units = units["units"].as_array().unwrap();
  let place = |id: i32| units.iter().position(|unit| unit["id"] == id).unwrap();
  assert!(
    place(stood.company) < place(stood.team)
      && place(stood.team) < place(part)
      && place(part) < place(cell)
  );
  assert_eq!(units[place(cell)]["parent"], part);
  assert_eq!(units[place(cell)]["company"], json!({ "id": stood.company, "name": "company-a" }));

  // Its head, invited there, stands there heading it and nothing above it.
  let (_, invite) = asked(
    &stood.app,
    Method::POST,
    "/invites",
    Some(json!({ "unit": cell, "head": true })),
    Some((1, "administrator")),
  )
  .await;
  assert_eq!(invite["company"]["id"], stood.company, "{invite}");
  let user = accepted_as(&stood, invite["token"].as_str().unwrap(), "cell-head").await;
  assert_eq!(unit_of(&stood, user).await, cell);
  assert!(heads(&stood, user, cell).await);
  assert!(!heads(&stood, user, part).await);

  // A member invited into the company itself stands in it, heading nothing.
  let (_, invite) = asked(
    &stood.app,
    Method::POST,
    "/invites",
    Some(json!({ "unit": stood.company, "head": false })),
    Some((1, "administrator")),
  )
  .await;
  assert_eq!(invite["unit"]["id"], stood.company, "{invite}");
  let user = accepted_as(&stood, invite["token"].as_str().unwrap(), "company-member").await;
  assert_eq!(unit_of(&stood, user).await, stood.company);
  assert!(!heads(&stood, user, stood.company).await);
}

#[tokio::test]
async fn an_invitation_the_table_already_holds_is_taken_as_it_was_made() {
  ready();
  let stood = stood().await;

  stood
    .scratch
    .run(
      r#"INSERT INTO "user_invites" ("token", "unit_id", "head", "made_by", "created_at", "expires_at")
         VALUES ('standing', $1::bigint, true, $2::bigint, 0, 9223372036854775807)"#,
      vec![stood.team.into(), stood.head.into()],
    )
    .await;

  let (_, listed) = asked(&stood.app, Method::GET, "/invites", None, Some((stood.head, "member"))).await;
  assert_eq!(listed["invites"][0]["token"], "standing", "{listed}");
  assert_eq!(listed["invites"][0]["unit"]["id"], stood.team);
  assert_eq!(listed["invites"][0]["head"], true);
  let (_, view) = asked(&stood.app, Method::GET, "/invites/standing", None, None).await;
  assert_eq!(view["state"], "open", "{view}");
  assert_eq!(view["company"]["id"], stood.company);

  let user = accepted_as(&stood, "standing", "standing-head").await;
  assert_eq!(unit_of(&stood, user).await, stood.team);
  assert!(heads(&stood, user, stood.team).await);
}

#[tokio::test]
async fn a_renamed_company_still_takes_in_invited_and_made_accounts() {
  ready();
  let stood = stood().await;
  let first: i32 = one(
    stood.scratch.db(),
    r#"SELECT "id" FROM "organizations" WHERE "name" = $1"#,
    vec![ORGANIZATION.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "id")
  .unwrap();

  stood
    .scratch
    .run(
      r#"UPDATE "organizations" SET "name" = 'Renamed Company' WHERE "id" = $1"#,
      vec![first.into()],
    )
    .await;

  let (_, invite) = asked(
    &stood.app,
    Method::POST,
    "/invites",
    Some(json!({ "unit": first, "head": false })),
    Some((1, "administrator")),
  )
  .await;
  let token = invite["token"].as_str().unwrap().to_owned();
  let (status, accepted) = asked(
    &stood.app,
    Method::POST,
    &format!("/invites/{token}/accept"),
    Some(json!({ "name": "newcomer", "password": "pw" })),
    None,
  )
  .await;
  assert_eq!(status, StatusCode::CREATED, "{accepted}");

  // A user made outside an invitation still goes into the first company, under its new name.
  let made = set_sign_in(stood.scratch.db(), "made-later", "the password", false).await.unwrap();
  let organization: i32 = one(
    stood.scratch.db(),
    r#"SELECT "organization_id" FROM "users" WHERE "id" = $1"#,
    vec![made.user.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "organization_id")
  .unwrap();
  assert_eq!(organization, first);
}

#[tokio::test]
async fn an_accepted_invitation_makes_a_disabled_account_enabled_once_its_machine_attaches() {
  ready();
  let stood = stood().await;
  let (_, invite) = asked(
    &stood.app,
    Method::POST,
    "/invites",
    Some(json!({ "unit": stood.team, "head": true })),
    Some((1, "administrator")),
  )
  .await;
  let token = invite["token"].as_str().unwrap().to_owned();
  let (status, view) = asked(&stood.app, Method::GET, &format!("/invites/{token}"), None, None).await;
  assert_eq!(status, StatusCode::OK, "{view}");
  assert_eq!(view["state"], "open");

  let (status, accepted) = asked(
    &stood.app,
    Method::POST,
    &format!("/invites/{token}/accept"),
    Some(json!({ "name": "newcomer", "password": "pw" })),
    None,
  )
  .await;
  assert_eq!(status, StatusCode::CREATED, "{accepted}");
  let user: i32 = accepted["user"].as_str().unwrap().parse().unwrap();
  let agent = accepted["agent"].as_str().unwrap().to_owned();
  assert_eq!(agent, format!("u{user}"));
  assert!(accepted["credential"].as_str().unwrap().starts_with(&format!("{agent}.")));
  assert!(accepted["install"]["linux"].as_str().unwrap().contains(&agent));

  // Disabled, placed, a head as the invitation said; the invitation is used.
  let row = one(
    stood.scratch.db(),
    r#"SELECT "is_enabled", "organization_id" FROM "users" WHERE "id" = $1"#,
    vec![user.into()],
  )
  .await
  .unwrap()
  .unwrap();
  assert!(!row.try_get::<bool>("", "is_enabled").unwrap());
  assert_eq!(row.try_get::<i32>("", "organization_id").unwrap(), stood.team);
  let (_, check) = asked(
    &stood.app,
    Method::POST,
    "/checks/unit",
    Some(json!({ "unit": stood.team, "user": user.to_string() })),
    None,
  )
  .await;
  assert_eq!(check["allowed"], true, "{check}");
  let (status, said) = asked(
    &stood.app,
    Method::POST,
    &format!("/invites/{token}/accept"),
    Some(json!({ "name": "other", "password": "pw" })),
    None,
  )
  .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "invite-closed");

  // Not proven while the hub holds no such machine; proven and enabled once it does.
  let (_, proof) = asked(&stood.app, Method::POST, &format!("/invites/{token}/proof"), None, None).await;
  assert_eq!(proof["active"], false, "{proof}");
  stood.hub.0.lock().unwrap().push(agent.clone());
  let (_, proof) = asked(&stood.app, Method::POST, &format!("/invites/{token}/proof"), None, None).await;
  assert_eq!(proof["active"], true, "{proof}");
  let row = one(
    stood.scratch.db(),
    r#"SELECT "is_enabled" FROM "users" WHERE "id" = $1"#,
    vec![user.into()],
  )
  .await
  .unwrap()
  .unwrap();
  assert!(row.try_get::<bool>("", "is_enabled").unwrap());

  // The machine reads attached; gone, it reads gone.
  let (_, node) = asked(&stood.app, Method::GET, &format!("/users/{user}/node"), None, None).await;
  assert_eq!(node["agent"], agent);
  assert_eq!(node["attached"], true);
  stood.hub.0.lock().unwrap().clear();
  let (_, node) = asked(&stood.app, Method::GET, &format!("/users/{user}/node"), None, None).await;
  assert_eq!(node["attached"], false);
  // An account bound to no machine reads none.
  let (_, node) =
    asked(&stood.app, Method::GET, &format!("/users/{}/node", stood.member), None, None).await;
  assert!(node.get("agent").is_none(), "{node}");
}

#[tokio::test]
async fn an_expired_invitation_opens_nothing() {
  ready();
  let stood = stood().await;
  let (_, invite) = asked(
    &stood.app,
    Method::POST,
    "/invites",
    Some(json!({ "unit": stood.team })),
    Some((stood.head, "member")),
  )
  .await;
  let token = invite["token"].as_str().unwrap().to_owned();

  stood
    .scratch
    .run(
      r#"UPDATE "user_invites" SET "expires_at" = 0 WHERE "token" = $1"#,
      vec![token.clone().into()],
    )
    .await;
  let (_, view) = asked(&stood.app, Method::GET, &format!("/invites/{token}"), None, None).await;
  assert_eq!(view["state"], "expired");
  let (status, said) = asked(
    &stood.app,
    Method::POST,
    &format!("/invites/{token}/accept"),
    Some(json!({ "name": "late", "password": "pw" })),
    None,
  )
  .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
}

#[tokio::test]
async fn the_administrator_binds_an_account_to_another_machine_and_takes_it_away() {
  ready();
  let stood = stood().await;
  let node_path = format!("/users/{}/node", stood.member);

  // Only the administrator binds a machine.
  let (status, _) =
    asked(&stood.app, Method::PUT, &node_path, Some(json!({})), Some((stood.head, "member"))).await;
  assert_eq!(status, StatusCode::FORBIDDEN);

  // Named no machine, the account is given a fresh name of its own, with that name's credential and installs.
  let (status, rebound) =
    asked(&stood.app, Method::PUT, &node_path, Some(json!({})), Some((1, "administrator"))).await;
  assert_eq!(status, StatusCode::OK, "{rebound}");
  let fresh = rebound["agent"].as_str().unwrap().to_owned();
  assert!(fresh.starts_with(&format!("u{}-", stood.member)), "{fresh}");
  assert!(rebound["credential"].as_str().unwrap().starts_with(&format!("{fresh}.")));
  assert!(rebound["install"]["windows"].as_str().unwrap().contains(&fresh));
  assert_eq!(rebound["attached"], false);

  // Not proven while the hub does not hold it; proven once it does.
  let proof_path = format!("{node_path}/proof");
  let (_, node) = asked(&stood.app, Method::POST, &proof_path, None, None).await;
  assert_eq!(node["agent"], fresh.as_str());
  assert_eq!(node["attached"], false);
  assert!(node.get("provenAt").is_none(), "{node}");
  stood.hub.0.lock().unwrap().push(fresh.clone());
  let (_, node) = asked(&stood.app, Method::POST, &proof_path, None, None).await;
  assert_eq!(node["attached"], true);
  assert!(node["provenAt"].is_i64(), "{node}");

  // A machine the hub holds already is proven as it is bound; one another account holds is refused.
  stood.hub.0.lock().unwrap().push("desk-a".into());
  let (_, rebound) = asked(
    &stood.app,
    Method::PUT,
    &node_path,
    Some(json!({ "agent": "desk-a" })),
    Some((1, "administrator")),
  )
  .await;
  assert_eq!(rebound["attached"], true, "{rebound}");
  let (_, node) = asked(&stood.app, Method::GET, &node_path, None, None).await;
  assert!(node["provenAt"].is_i64(), "{node}");
  let (status, said) = asked(
    &stood.app,
    Method::PUT,
    &format!("/users/{}/node", stood.head),
    Some(json!({ "agent": "desk-a" })),
    Some((1, "administrator")),
  )
  .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "node-taken");
  let (status, _) = asked(
    &stood.app,
    Method::PUT,
    &node_path,
    Some(json!({ "agent": "desk a; true" })),
    Some((1, "administrator")),
  )
  .await;
  assert_eq!(status, StatusCode::BAD_REQUEST);

  // Taken away, the account is bound to none; a second time there is nothing to take.
  let (status, _) = asked(&stood.app, Method::DELETE, &node_path, None, Some((1, "administrator"))).await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  let (_, node) = asked(&stood.app, Method::GET, &node_path, None, None).await;
  assert!(node.get("agent").is_none(), "{node}");
  let (status, _) = asked(&stood.app, Method::DELETE, &node_path, None, Some((1, "administrator"))).await;
  assert_eq!(status, StatusCode::NOT_FOUND);

  // An account that has left is bound to no machine again.
  let (status, _) = asked(
    &stood.app,
    Method::POST,
    &format!("/users/{}/leave", stood.member),
    None,
    Some((1, "administrator")),
  )
  .await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  let (status, said) =
    asked(&stood.app, Method::PUT, &node_path, Some(json!({})), Some((1, "administrator"))).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "left");
}

#[tokio::test]
async fn the_administrator_binds_several_accounts_to_a_machine_declared_shared() {
  ready();
  let stood = stood().await;
  let member_path = format!("/users/{}/node", stood.member);
  let head_path = format!("/users/{}/node", stood.head);
  let bind = |path: String, binding: Value| asked_as_administrator(&stood.app, Method::PUT, path, binding);
  stood.hub.0.lock().unwrap().push("desk-shared".into());

  // A machine bound shared reads back as shared.
  let (status, rebound) =
    bind(member_path.clone(), json!({ "agent": "desk-shared", "shared": true })).await;
  assert_eq!(status, StatusCode::OK, "{rebound}");
  assert_eq!(rebound["shared"], true);
  let (_, node) = asked(&stood.app, Method::GET, &member_path, None, None).await;
  assert_eq!(node["shared"], true, "{node}");

  // A second binding that does not declare it shared is refused as a taken machine.
  let (status, said) = bind(head_path.clone(), json!({ "agent": "desk-shared" })).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "node-taken");

  // Declared shared on both sides, the two bindings stand side by side.
  let (status, rebound) = bind(head_path.clone(), json!({ "agent": "desk-shared", "shared": true })).await;
  assert_eq!(status, StatusCode::OK, "{rebound}");
  assert_eq!(rebound["attached"], true);
  let (_, node) = asked(&stood.app, Method::GET, &head_path, None, None).await;
  assert_eq!((node["agent"].as_str(), node["shared"].as_bool()), (Some("desk-shared"), Some(true)));

  // A machine one account holds unshared is not taken by a binding declaring it shared.
  stood.hub.0.lock().unwrap().push("desk-own".into());
  let (status, _) = bind(member_path, json!({ "agent": "desk-own" })).await;
  assert_eq!(status, StatusCode::OK);
  let (status, said) = bind(head_path, json!({ "agent": "desk-own", "shared": true })).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "node-taken");
}

/// One request as the platform administrator.
async fn asked_as_administrator(
  app: &Router,
  method: Method,
  path: String,
  body: Value,
) -> (StatusCode, Value) {
  asked(app, method, &path, Some(body), Some((1, "administrator"))).await
}
