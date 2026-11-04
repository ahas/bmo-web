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

  // Their rooms, which they read, their own account, which they keep, and the screens units bring that a
  // member could open before this surface did.
  assert_eq!(section(&said, "rooms")["read"], true, "{said}");
  assert_eq!(section(&said, "rooms")["write"], false, "{said}");
  assert_eq!(section(&said, "account")["read"], true, "{said}");
  assert_eq!(section(&said, "account")["write"], true, "{said}");
  assert_eq!(section(&said, "mail")["read"], true, "{said}");
  assert_eq!(section(&said, "brain")["read"], true, "{said}");

  // Nothing else, which is the console as it stands today.
  assert_eq!(section(&said, "live")["read"], false, "{said}");
  assert_eq!(section(&said, "agents")["write"], false, "{said}");

  assert!(check(&app, &user, "read", "rooms").await);
  assert!(!check(&app, &user, "write", "rooms").await);
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
