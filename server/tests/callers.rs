//! A room's callers (docs/accounts.md, 「A room's callers」): the users granted `ask` on a room directly, set with
//! no message by the administrator, the room's leader or a head of the user's unit, never across companies but by
//! the administrator, and refused to anyone else.

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

async fn unit(scratch: &Scratch, name: &str, parent: Option<i32>) -> i32 {
  one(
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

async fn placed(scratch: &Scratch, name: &str, unit: i32, administrator: bool) -> i32 {
  let user = set_sign_in(scratch.db(), name, "the password", administrator).await.unwrap().user;

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![unit.into(), user.into()],
    )
    .await;

  user
}

async fn asked(app: &Router, method: Method, path: &str, user: i32) -> (StatusCode, Value) {
  let request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header("owner-key", user.to_string())
    .body(Body::empty())
    .unwrap();
  let answer = app.clone().oneshot(request).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

fn callers(said: &Value) -> Vec<String> {
  said["callers"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one["user"].as_str().unwrap().to_owned())
    .collect()
}

#[tokio::test]
async fn a_rooms_callers_are_set_by_the_administrator_its_leader_or_a_head_and_by_nobody_else() {
  ready();
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

  let company = unit(&scratch, "company-a", None).await;
  let centre = unit(&scratch, "centre-a", Some(company)).await;
  let team = unit(&scratch, "team-a", Some(centre)).await;
  let other = unit(&scratch, "company-b", None).await;
  let member = placed(&scratch, "member-a", team, false).await;
  let head = placed(&scratch, "head-a", centre, false).await;
  let outsider = placed(&scratch, "outsider", other, false).await;
  let admin = placed(&scratch, "admin-a", other, true).await;

  scratch
    .run(
      r#"INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
         VALUES ('organization', $1, 'manager', 'user', $2, '')"#,
      vec![centre.to_string().into(), head.to_string().into()],
    )
    .await;

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let path = format!("/rooms/{ROOM}/callers");
  let of = |user: i32| format!("{path}/{user}");

  // Nobody calls yet, and a member who neither leads the room nor heads anyone changes nothing.
  let (status, said) = asked(&app, Method::GET, &path, member).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said, json!({ "room": ROOM, "callers": [], "mayChange": false }));
  assert_eq!(asked(&app, Method::PUT, &of(member), member).await.0, StatusCode::FORBIDDEN);

  // A head of the member's unit makes them a caller, with no message to make it on.
  assert_eq!(asked(&app, Method::PUT, &of(member), head).await.0, StatusCode::NO_CONTENT);
  assert_eq!(callers(&asked(&app, Method::GET, &path, head).await.1), [member.to_string()]);

  // The room's leader sets a caller of the same company, and never one of another.
  scratch.messages.2.lock().unwrap().insert(ROOM, vec![member]);

  assert_eq!(asked(&app, Method::GET, &path, member).await.1["mayChange"], json!(true));
  assert_eq!(asked(&app, Method::PUT, &of(head), member).await.0, StatusCode::NO_CONTENT);
  assert_eq!(asked(&app, Method::PUT, &of(outsider), member).await.0, StatusCode::FORBIDDEN);

  // The administrator sets anyone.
  assert_eq!(asked(&app, Method::PUT, &of(outsider), admin).await.0, StatusCode::NO_CONTENT);
  assert_eq!(
    callers(&asked(&app, Method::GET, &path, admin).await.1),
    [member.to_string(), head.to_string(), outsider.to_string()]
  );

  // Taken away, the grant is gone.
  assert_eq!(asked(&app, Method::DELETE, &of(member), head).await.0, StatusCode::NO_CONTENT);
  assert_eq!(
    callers(&asked(&app, Method::GET, &path, admin).await.1),
    [head.to_string(), outsider.to_string()]
  );
  assert_eq!(asked(&app, Method::PUT, &of(9999), admin).await.0, StatusCode::NOT_FOUND);
}
