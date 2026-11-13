//! The people directory (docs/accounts.md, 「The people directory」): the users of the reader's own
//! organisation found by name, organisation and the contact details the reader may see. A member's search
//! matches no contact detail but their own, and a person outside the organisation is not found.

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_client::UserProfile;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::users::{set_profile, set_sign_in};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

async fn moved(name: &str) -> Scratch {
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
  let user = set_sign_in(scratch.db(), name, "the password", false).await.unwrap().user;
  let profile = UserProfile {
    job_title: "Engineer".into(),
    landline: "landline-a".into(),
    mobile: "mobile-a".into(),
    email: "member@example.com".into(),
  };

  set_profile(scratch.db(), user, &profile).await.unwrap();

  scratch
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

async fn asked(app: &Router, path: &str, key: Option<&str>, role: Option<&str>) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(Method::GET)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

  if let Some(key) = key {
    request = request.header("owner-key", key);
  }
  if let Some(role) = role {
    request = request.header("owner-role", role);
  }

  let answer = app.clone().oneshot(request.body(Body::empty()).unwrap()).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let body = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, body)
}

async fn owner(app: &Router) -> String {
  let request = Request::builder()
    .method(Method::GET)
    .uri(format!("/senders/{OWNER}/user"))
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));
  let answer = app.clone().oneshot(request.body(Body::empty()).unwrap()).await.unwrap();

  assert_eq!(answer.status(), StatusCode::OK);

  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let said: Value = serde_json::from_slice(&bytes).unwrap();

  said["user"].as_str().unwrap().to_owned()
}

fn people(said: &Value) -> &Vec<Value> {
  said["people"].as_array().expect("people is a list")
}

fn names(said: &Value) -> Vec<&str> {
  people(said).iter().map(|one| one["name"].as_str().unwrap()).collect()
}

#[tokio::test]
async fn an_administrator_finds_people_of_the_organisation_by_name_organisation_and_contact() {
  ready();
  let scratch = moved("member-a").await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;

  for words in ["member-a", "Engineer", "bmo", "member@example.com"] {
    let (status, said) =
      asked(&app, &format!("/users/search?q={words}"), Some(&boss), Some("administrator")).await;

    assert_eq!(status, StatusCode::OK, "{said}");
    assert!(names(&said).contains(&"member-a"), "{words}: {said}");
  }

  // The administrator sees the contact details.
  let (_, said) = asked(&app, "/users/search?q=Engineer", Some(&boss), Some("administrator")).await;
  let member = people(&said).iter().find(|one| one["name"] == "member-a").unwrap();

  assert_eq!(member["email"], "member@example.com", "{said}");
  assert_eq!(member["mobile"], "mobile-a", "{said}");

  // A search that finds nothing answers nobody.
  let (status, said) = asked(&app, "/users/search?q=nobody-here", Some(&boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(people(&said).is_empty(), "{said}");
}

#[tokio::test]
async fn a_person_outside_the_organisation_is_never_found() {
  ready();
  let scratch = moved("member-b").await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;
  let outside = set_sign_in(scratch.db(), "outsider", "the password", false).await.unwrap().user;
  let other = one(
    scratch.db(),
    r#"INSERT INTO "organizations" ("name") VALUES ('elsewhere') RETURNING "id""#,
    vec![],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<i32>("", "id")
  .unwrap();

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![other.into(), outside.into()],
    )
    .await;
  set_profile(
    scratch.db(),
    outside,
    &UserProfile {
      job_title: "Engineer".into(),
      landline: "landline-c".into(),
      mobile: "mobile-c".into(),
      email: "outsider@example.com".into(),
    },
  )
  .await
  .unwrap();

  let (status, said) = asked(&app, "/users/search?q=outsider", Some(&boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(!names(&said).contains(&"outsider"), "{said}");

  let (status, said) =
    asked(&app, &format!("/users/{outside}/person"), Some(&boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::NOT_FOUND, "{said}");
}

#[tokio::test]
async fn a_member_sees_no_contact_detail_and_matches_none_but_their_own() {
  ready();
  let scratch = moved("member-c").await;
  let app = app(&scratch).await;
  let member = one(scratch.db(), r#"SELECT "id" FROM "users" WHERE "username" = 'member-c'"#, vec![])
    .await
    .unwrap()
    .unwrap()
    .try_get::<i32>("", "id")
    .unwrap();
  let other = set_sign_in(scratch.db(), "member-e", "the password", false).await.unwrap().user;

  set_profile(
    scratch.db(),
    other,
    &UserProfile {
      job_title: "Designer".into(),
      landline: "landline-b".into(),
      mobile: "mobile-b".into(),
      email: "other@example.com".into(),
    },
  )
  .await
  .unwrap();
  let key = member.to_string();

  // Another person's name and job title are read, and their contact details are not.
  let (status, said) = asked(&app, "/users/search?q=Designer", Some(&key), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  let found = people(&said).iter().find(|one| one["name"] == "member-e").unwrap();

  assert_eq!(found["jobTitle"], "Designer", "{said}");
  assert!(found.get("email").is_none(), "{said}");
  assert!(found.get("mobile").is_none(), "{said}");

  // Another person's contact detail is no answer to a member.
  let (status, said) = asked(&app, "/users/search?q=mobile-b", Some(&key), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(people(&said).is_empty(), "{said}");

  // Their own is.
  let (status, said) = asked(&app, "/users/search?q=mobile-a", Some(&key), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(names(&said), vec!["member-c"], "{said}");

  // The person's page carries the same fields as the search.
  let (status, said) = asked(&app, &format!("/users/{other}/person"), Some(&key), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said.get("email").is_none(), "{said}");

  let (status, said) = asked(&app, &format!("/users/{member}/person"), Some(&key), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["email"], "member@example.com", "{said}");
}

#[tokio::test]
async fn a_login_that_names_no_user_is_refused_and_an_empty_search_answers_nobody() {
  ready();
  let scratch = moved("member-d").await;
  let app = app(&scratch).await;

  for key in [None, Some("999999")] {
    let (status, said) = asked(&app, "/users/search?q=Engineer", key, Some("member")).await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
    assert_eq!(said["code"], "forbidden", "{said}");
  }

  // A user of the deployment whose words are empty is answered nobody.
  let boss = owner(&app).await;
  let (status, said) = asked(&app, "/users/search?q=", Some(&boss), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(people(&said).is_empty(), "{said}");
}

#[tokio::test]
async fn the_members_list_is_the_whole_company_by_key_and_name_alone() {
  ready();
  let scratch = moved("member-f").await;
  let app = app(&scratch).await;
  let boss = owner(&app).await;
  let member = one(scratch.db(), r#"SELECT "id" FROM "users" WHERE "username" = 'member-f'"#, vec![])
    .await
    .unwrap()
    .unwrap()
    .try_get::<i32>("", "id")
    .unwrap();
  let outside = set_sign_in(scratch.db(), "outsider", "the password", false).await.unwrap().user;
  let other = one(
    scratch.db(),
    r#"INSERT INTO "organizations" ("name") VALUES ('elsewhere') RETURNING "id""#,
    vec![],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<i32>("", "id")
  .unwrap();

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![other.into(), outside.into()],
    )
    .await;

  // A member reads every person of their company, the administrator and themselves among them, each by key and
  // name and nothing else, and nobody of another company.
  let key = member.to_string();
  let (status, said) = asked(&app, "/users/members", Some(&key), Some("member")).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  let members = said["members"].as_array().expect("members is a list");
  let keys: Vec<&str> = members.iter().map(|one| one["user"].as_str().unwrap()).collect();

  assert!(keys.contains(&key.as_str()), "{said}");
  assert!(keys.contains(&boss.as_str()), "{said}");
  assert!(!keys.contains(&outside.to_string().as_str()), "{said}");
  for one in members {
    let mut fields: Vec<&str> = one.as_object().unwrap().keys().map(String::as_str).collect();

    fields.sort_unstable();
    assert_eq!(fields, vec!["name", "user"], "{said}");
  }
  let named = members.iter().find(|one| one["user"] == key.as_str()).unwrap();

  assert_eq!(named["name"], "member-f", "{said}");

  // A call naming no user of the deployment is refused, as a search is.
  for key in [None, Some("999999")] {
    let (status, said) = asked(&app, "/users/members", key, Some("member")).await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  }
}
