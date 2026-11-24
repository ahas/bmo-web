//! The console's sections (docs/accounts.md, 「Console sections」): a user's read and write on each, the defaults
//! a user is made with, and the administrator's written set. A permitted read and write open through sumida's
//! point check, and a refused one does not.

use crate::support::{OWNER, ROOM, Scratch, SharedDatabase, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

async fn moved() -> Scratch {
  static SHARED: SharedDatabase = SharedDatabase::new();

  SHARED.get(seed).await
}

async fn seed(scratch: Scratch) -> Scratch {
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

  scratch
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

/// A database of its own, with the data move written, for a test that changes a setting the others read.
async fn fresh() -> Scratch {
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

  scratch
}

/// A request as the login named by `key` and `role` asks it, with the token; the status and body it answers.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  key: Option<&str>,
  role: Option<&str>,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

  if let Some(key) = key {
    request = request.header("owner-key", key);
  }
  if let Some(role) = role {
    request = request.header("owner-role", role);
  }

  let request = match body {
    Some(body) => request
      .header(header::CONTENT_TYPE, "application/json")
      .body(Body::from(body.to_string()))
      .unwrap(),
    None => request.body(Body::empty()).unwrap(),
  };
  let answer = app.clone().oneshot(request).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let body = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, body)
}

async fn owner(app: &Router) -> String {
  let (status, said) = asked(app, Method::GET, &format!("/senders/{OWNER}/user"), None, None, None).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  said["user"].as_str().unwrap().to_owned()
}

fn section<'a>(said: &'a Value, name: &str) -> &'a Value {
  said["sections"]
    .as_array()
    .expect("sections is a list")
    .iter()
    .find(|row| row["section"] == name)
    .unwrap_or_else(|| panic!("{name} stands among {said}"))
}

async fn check(app: &Router, user: &str, relation: &str, section: &str) -> bool {
  let (status, said) = asked(
    app,
    Method::POST,
    "/checks/object",
    Some(json!({ "kind": "bmo_section", "object": section, "relation": relation, "user": user })),
    None,
    None,
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");

  said["allowed"].as_bool().unwrap()
}

#[tokio::test]
async fn a_user_made_is_given_the_defaults_in_force() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let made = set_sign_in(scratch.db(), "member-defaults", "the password", false).await.unwrap();
  let user = made.user.to_string();

  let (status, said) =
    asked(&app, Method::GET, &format!("/users/{user}/sections"), None, Some(&user), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  // Their rooms, which they read and speak in, their own account, which they keep, and the screens units bring that a
  // member could open before this surface did.
  assert_eq!(section(&said, "rooms")["read"], true, "{said}");
  assert_eq!(section(&said, "rooms")["write"], true, "{said}");
  assert_eq!(section(&said, "account")["read"], true, "{said}");
  assert_eq!(section(&said, "account")["write"], true, "{said}");
  assert_eq!(section(&said, "mail")["read"], true, "{said}");
  assert_eq!(section(&said, "brain")["read"], true, "{said}");

  // Nothing else, which is the console as it stands today, agent management's five parts included.
  assert_eq!(section(&said, "live")["read"], false, "{said}");

  for part in ["supervisors", "roles", "repositories", "models", "model-files"] {
    assert_eq!(section(&said, part)["read"], false, "{said}");
    assert_eq!(section(&said, part)["write"], false, "{said}");
  }

  assert!(check(&app, &user, "read", "rooms").await);
  assert!(check(&app, &user, "write", "rooms").await);
  assert!(!check(&app, &user, "read", "live").await);
}

#[tokio::test]
async fn an_administrator_sets_one_person_s_read_and_write_and_the_checks_follow() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;
  let made = set_sign_in(scratch.db(), "member-set", "the password", false).await.unwrap();
  let user = made.user.to_string();
  let path = format!("/users/{user}/sections");

  let (status, said) = asked(
    &app,
    Method::PUT,
    &path,
    Some(json!({ "sections": [
      { "section": "live", "read": true, "write": true },
      { "section": "rooms", "read": true, "write": false }
    ] })),
    Some(&boss),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(section(&said, "live")["read"], true, "{said}");
  assert_eq!(section(&said, "live")["write"], true, "{said}");
  assert_eq!(section(&said, "rooms")["write"], false, "{said}");

  // The permitted read and the permitted write.
  assert!(check(&app, &user, "read", "live").await);
  assert!(check(&app, &user, "write", "live").await);
  assert!(check(&app, &user, "read", "rooms").await);
  // The refused write.
  assert!(!check(&app, &user, "write", "rooms").await);

  // A section written without a write is a read alone, and a section named no more is taken away.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &path,
    Some(json!({ "sections": [{ "section": "rooms", "read": true, "write": false }] })),
    Some(&boss),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(section(&said, "live")["read"], false, "{said}");
  assert!(!check(&app, &user, "read", "live").await);

  // A write is also a read.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &path,
    Some(json!({ "sections": [{ "section": "live", "read": false, "write": true }] })),
    Some(&boss),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(section(&said, "live")["read"], true, "{said}");
  assert_eq!(section(&said, "live")["write"], true, "{said}");
}

#[tokio::test]
async fn agent_management_s_five_parts_are_set_and_checked_apart() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;
  let made = set_sign_in(scratch.db(), "member-agents", "the password", false).await.unwrap();
  let user = made.user.to_string();

  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/users/{user}/sections"),
    Some(json!({ "sections": [
      { "section": "supervisors", "read": true, "write": false },
      { "section": "roles", "read": false, "write": true }
    ] })),
    Some(&boss),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");

  // The permitted read on the supervisors, and the refused write on them.
  assert!(check(&app, &user, "read", "supervisors").await);
  assert!(!check(&app, &user, "write", "supervisors").await);
  // The permitted write on the roles, which is a read as well.
  assert!(check(&app, &user, "read", "roles").await);
  assert!(check(&app, &user, "write", "roles").await);
  // The other parts stand closed.
  for part in ["repositories", "models", "model-files"] {
    assert!(!check(&app, &user, "read", part).await, "{part}");
    assert!(!check(&app, &user, "write", part).await, "{part}");
  }
}

#[tokio::test]
async fn an_old_agent_management_grant_is_moved_to_the_five_parts() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;
  let made = set_sign_in(scratch.db(), "member-legacy", "the password", false).await.unwrap();
  let user = made.user.to_string();

  // What the surface held before the split stood: one grant on `agents`.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/users/{user}/sections"),
    Some(json!({ "sections": [{ "section": "agents", "read": true, "write": false }] })),
    Some(&boss),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(check(&app, &user, "read", "agents").await);

  // The move runs once, as a deployment starts; it is run here against the grant written above.
  scratch
    .run(r#"DELETE FROM "settings" WHERE "key" = $1"#, vec!["sections_agents_split_at".into()])
    .await;
  bmo_web_server::sections::split_agents(scratch.db()).await.unwrap();

  for part in ["supervisors", "roles", "repositories", "models", "model-files"] {
    assert!(check(&app, &user, "read", part).await, "{part}");
    assert!(!check(&app, &user, "write", part).await, "{part}");
  }

  // The old section is gone, and the marker keeps the move from running again.
  assert!(!check(&app, &user, "read", "agents").await);
  bmo_web_server::sections::split_agents(scratch.db()).await.unwrap();
  assert!(check(&app, &user, "read", "supervisors").await);
}

#[tokio::test]
async fn a_user_given_the_earlier_defaults_is_given_the_rooms_write_once() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;
  let earlier = set_sign_in(scratch.db(), "member-earlier", "the password", false)
    .await
    .unwrap()
    .user
    .to_string();
  let set = set_sign_in(scratch.db(), "member-set", "the password", false)
    .await
    .unwrap()
    .user
    .to_string();

  // What the earlier defaults left: the rooms' read alone.
  scratch
    .run(
      r#"DELETE FROM "relation_tuples"
         WHERE "resource_type" = 'bmo_section' AND "resource_id" = 'rooms' AND "relation" = 'write'"#,
      vec![],
    )
    .await;
  // One whose rooms an administrator set to read alone, by hand.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/users/{set}/sections"),
    Some(json!({ "sections": [{ "section": "rooms", "read": true, "write": false }] })),
    Some(&boss),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(!check(&app, &earlier, "write", "rooms").await);

  scratch
    .run(
      r#"DELETE FROM "settings" WHERE "key" = $1"#,
      vec!["sections_rooms_write_seeded_at".into()],
    )
    .await;
  bmo_web_server::sections::backfill_rooms_write(scratch.db()).await.unwrap();

  assert!(check(&app, &earlier, "write", "rooms").await);
  assert!(!check(&app, &set, "write", "rooms").await, "what an administrator set stays as set");

  // The mark keeps it from running again: a write taken away afterwards stays away.
  scratch
    .run(
      r#"DELETE FROM "relation_tuples"
         WHERE "resource_type" = 'bmo_section' AND "resource_id" = 'rooms' AND "relation" = 'write'"#,
      vec![],
    )
    .await;
  bmo_web_server::sections::backfill_rooms_write(scratch.db()).await.unwrap();
  assert!(!check(&app, &earlier, "write", "rooms").await);
}

#[tokio::test]
async fn a_user_other_than_the_administrator_may_not_set_sections() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let made = set_sign_in(scratch.db(), "member-refused", "the password", false).await.unwrap();
  let user = made.user.to_string();
  let other = set_sign_in(scratch.db(), "member-other", "the password", false)
    .await
    .unwrap()
    .user
    .to_string();

  // Their own sections are theirs to read.
  let (status, said) =
    asked(&app, Method::GET, &format!("/users/{user}/sections"), None, Some(&user), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  // Another person's are not.
  let (status, said) = asked(
    &app,
    Method::GET,
    &format!("/users/{other}/sections"),
    None,
    Some(&user),
    Some("member"),
  )
  .await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  assert_eq!(said["code"], "forbidden", "{said}");

  // Nor is any change to them, and nor is the users list.
  for (method, path, body) in [
    (Method::PUT, format!("/users/{user}/sections"), Some(json!({ "sections": [] }))),
    (Method::GET, "/users".to_owned(), None),
  ] {
    let (status, said) = asked(&app, method, &path, body, Some(&user), Some("member")).await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
    assert_eq!(said["code"], "forbidden", "{said}");
  }
}

#[tokio::test]
async fn the_administrator_passes_every_section() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;

  for section in bmo_web_server::sections::SECTIONS {
    assert!(check(&app, &boss, "read", section).await, "{section}");
    assert!(check(&app, &boss, "write", section).await, "{section}");
  }
}

#[tokio::test]
async fn the_users_list_answers_the_administrator_alone() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;

  let (status, said) = asked(&app, Method::GET, "/users", None, Some(&boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said["users"].as_array().is_some_and(|users| !users.is_empty()), "{said}");
  assert!(
    said["users"]
      .as_array()
      .unwrap()
      .iter()
      .any(|user| user["user"] == boss && user["administrator"] == true)
  );
}

/// A unit of its own, under `parent` where one is named.
async fn unit_made(scratch: &Scratch, name: &str, parent: Option<i32>) -> i32 {
  bmo_web_server::one(
    scratch.db(),
    r#"INSERT INTO "organizations" ("name", "parent_id") VALUES ($1, $2) RETURNING "id""#,
    vec![name.into(), parent.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<i32>("", "id")
  .unwrap()
}

/// A member standing in `unit`, heading it where `heads` says, with the defaults in force.
async fn standing_in(scratch: &Scratch, name: &str, unit: i32, heads: bool) -> String {
  let user = set_sign_in(scratch.db(), name, "the password", false).await.unwrap().user;

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![unit.into(), user.into()],
    )
    .await;

  if heads {
    scratch
      .run(
        r#"INSERT INTO "relation_tuples"
             ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
           VALUES ('organization', $1, 'manager', 'user', $2, '')"#,
        vec![unit.to_string().into(), user.to_string().into()],
      )
      .await;
  }

  user.to_string()
}

#[tokio::test]
async fn a_head_gives_their_people_only_the_sections_they_hold() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = unit_made(&scratch, "company-sections", None).await;
  let team = unit_made(&scratch, "team-sections", Some(company)).await;
  let head = standing_in(&scratch, "head-sections", company, true).await;
  let member = standing_in(&scratch, "member-sections", team, false).await;
  let outsider =
    standing_in(&scratch, "outsider-sections", unit_made(&scratch, "other-company", None).await, false)
      .await;
  let defaults = |extra: Vec<Value>| {
    let mut rows = vec![
      json!({ "section": "rooms", "read": true, "write": true }),
      json!({ "section": "account", "read": true, "write": true }),
      json!({ "section": "supply", "read": true, "write": true }),
      json!({ "section": "files", "read": true, "write": false }),
    ];

    rows.extend(extra);
    json!({ "sections": rows })
  };

  // The administrator gives the head the files' read beside the defaults, and the member the defaults alone.
  for (user, files) in [(&head, true), (&member, false)] {
    let body = defaults(vec![]);
    let body = if files {
      body
    } else {
      json!({ "sections": body["sections"].as_array().unwrap()[..3] })
    };
    let (status, said) = asked(
      &app,
      Method::PUT,
      &format!("/users/{user}/sections"),
      Some(body),
      Some(&head),
      Some("administrator"),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{said}");
  }

  // The head reads the sections of a person under the unit they head, and not of one outside it.
  let (status, said) = asked(
    &app,
    Method::GET,
    &format!("/users/{member}/sections"),
    None,
    Some(&head),
    Some("member"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");

  let (status, said) = asked(
    &app,
    Method::GET,
    &format!("/users/{outsider}/sections"),
    None,
    Some(&head),
    Some("member"),
  )
  .await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // The head holds the files' read alone, so they give it, and the write they do not hold is refused whole.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/users/{member}/sections"),
    Some(defaults(vec![])),
    Some(&head),
    Some("member"),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(section(&said, "files")["read"], true, "{said}");

  for asked_for in [
    json!({ "section": "monitor", "read": true, "write": false }),
    json!({ "section": "files", "read": true, "write": true }),
  ] {
    let mut rows: Vec<Value> = defaults(vec![])["sections"].as_array().unwrap()[..3].to_vec();

    rows.push(json!({ "section": "files", "read": true, "write": false }));
    rows.retain(|row| row["section"] != asked_for["section"]);
    rows.push(asked_for.clone());

    let body = json!({ "sections": rows });
    let (status, said) = asked(
      &app,
      Method::PUT,
      &format!("/users/{member}/sections"),
      Some(body),
      Some(&head),
      Some("member"),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{asked_for} {said}");
    assert!(!check(&app, &member, "read", "monitor").await);
  }

  // Nor does a head write a person outside the units they head, or their own set.
  for user in [&outsider, &head] {
    let (status, said) = asked(
      &app,
      Method::PUT,
      &format!("/users/{user}/sections"),
      Some(defaults(vec![])),
      Some(&head),
      Some("member"),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{user} {said}");
  }
}
