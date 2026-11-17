//! A user's job title and contact details (docs/accounts.md, 「Users and senders」; docs/boundary.md, 「Users and
//! senders」): kept by the account's holder or an administrator, read empty where the account keeps none, and
//! refused to any other login before a row is read or written.

use crate::support;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::user_for_sender;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use support::{Scratch, console_hash, ready};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";
const MEMBER: i64 = 777;

/// A database the move has run on, with the platform administrator and one other account.
async fn seeded() -> (Scratch, i32, i32) {
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;

  let moved = run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![],
      rooms: vec![],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();
  let boss = moved.administrator.expect("the move names the platform administrator");
  let member = user_for_sender(scratch.db(), MEMBER).await.unwrap();

  (scratch, boss, member)
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

/// A request with the token and, where given, the login it is made for, and the status and body it is answered with.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  key: Option<i32>,
  role: Option<&str>,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

  if let Some(key) = key {
    request = request.header("owner-key", key.to_string());
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

#[tokio::test]
async fn a_profile_reads_empty_where_nothing_is_kept_and_its_holder_writes_it_whole() {
  ready();
  let (scratch, _boss, member) = seeded().await;
  let app = app(&scratch).await;
  let path = format!("/users/{member}/profile");

  let (status, held) = asked(&app, Method::GET, &path, None, Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{held}");
  assert_eq!(
    held,
    json!({ "fullName": "", "jobTitle": "", "rank": "", "duty": "", "landline": "", "mobile": "", "email": "" })
  );

  let kept = json!({
    "fullName": "Person A",
    "jobTitle": "Field engineer",
    "rank": "",
    "duty": "",
    "landline": "office 12",
    "mobile": "mobile 34",
    "email": "engineer@example.com"
  });
  let (status, saved) =
    asked(&app, Method::POST, &path, Some(kept.clone()), Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{saved}");
  assert_eq!(saved, kept);

  let (status, again) = asked(&app, Method::GET, &path, None, Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(again, kept);

  // The person's name is the one every answer reads the user by, and the login stays as it was.
  let (_, user) = asked(&app, Method::GET, &format!("/users/{member}"), None, None, None).await;

  assert_eq!(user["fullName"], "Person A", "{user}");
  assert_ne!(user["name"], "Person A");

  let (_, users) = asked(&app, Method::GET, "/users", None, Some(member), Some("administrator")).await;
  let key = member.to_string();
  let listed = users["users"].as_array().unwrap().iter().find(|row| row["user"] == key.as_str());

  assert_eq!(listed.unwrap()["fullName"], "Person A", "{users}");

  // A name is kept trimmed.
  let mut padded = kept.clone();
  padded["fullName"] = json!("  Person A  ");
  let (status, saved) = asked(&app, Method::POST, &path, Some(padded), Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(saved, kept);

  let cleared = json!({ "fullName": "", "jobTitle": "", "rank": "", "duty": "", "landline": "", "mobile": "", "email": "" });
  let (status, empty) = asked(&app, Method::POST, &path, Some(cleared), Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(
    empty,
    json!({ "fullName": "", "jobTitle": "", "rank": "", "duty": "", "landline": "", "mobile": "", "email": "" })
  );
}

#[tokio::test]
async fn an_administrator_keeps_anothers_profile_and_another_login_is_refused() {
  ready();
  let (scratch, boss, member) = seeded().await;
  let app = app(&scratch).await;
  let path = format!("/users/{member}/profile");
  let bosses = format!("/users/{boss}/profile");
  let kept = json!({
    "fullName": "Person A",
    "jobTitle": "Field engineer",
    "rank": "",
    "duty": "",
    "landline": "office 12",
    "mobile": "mobile 34",
    "email": "engineer@example.com"
  });

  // Another account's profile is neither read nor written by a member.
  let (status, said) =
    asked(&app, Method::POST, &bosses, Some(kept.clone()), Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::FORBIDDEN);
  assert_eq!(said["code"], "forbidden");

  let (status, _) = asked(&app, Method::GET, &bosses, None, Some(member), Some("member")).await;

  assert_eq!(status, StatusCode::FORBIDDEN);

  // A call naming no login is refused even on the holder's own path.
  let (status, _) = asked(&app, Method::GET, &path, None, None, None).await;

  assert_eq!(status, StatusCode::FORBIDDEN);

  // The administrator writes another account's profile, and the refused write left it empty.
  let (status, held) = asked(&app, Method::GET, &bosses, None, Some(boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(
    held,
    json!({ "fullName": "", "jobTitle": "", "rank": "", "duty": "", "landline": "", "mobile": "", "email": "" })
  );

  let (status, saved) =
    asked(&app, Method::POST, &path, Some(kept.clone()), Some(boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK, "{saved}");
  assert_eq!(saved, kept);

  let (status, read) = asked(&app, Method::GET, &path, None, Some(boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(read, kept);
}

#[tokio::test]
async fn a_profile_of_a_user_who_does_not_stand_is_answered_absent() {
  ready();
  let (scratch, boss, _member) = seeded().await;
  let app = app(&scratch).await;

  let (status, said) =
    asked(&app, Method::GET, "/users/999999/profile", None, Some(boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(said["code"], "not-found");
}
