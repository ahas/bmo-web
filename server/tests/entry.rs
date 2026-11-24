//! Who lets a person into a room (docs/accounts.md, 「A room's callers」): its opener, a head of the opener's unit or
//! the administrator, within the room's company; and a sender linked to a user by the administrator alone.

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

async fn sent(
  app: &Router,
  method: Method,
  path: &str,
  role: Option<&str>,
  body: Option<Value>,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

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
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

#[tokio::test]
async fn a_person_is_let_into_a_room_by_its_opener_a_head_of_the_openers_unit_or_the_administrator_within_its_company()
 {
  ready();
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
    },
  )
  .await
  .unwrap();

  let company = unit(&scratch, "company-a", None).await;
  let centre = unit(&scratch, "centre-a", Some(company)).await;
  let team = unit(&scratch, "team-a", Some(centre)).await;
  let elsewhere = unit(&scratch, "team-b", Some(company)).await;
  let other = unit(&scratch, "company-b", None).await;
  let opener = placed(&scratch, "opener-a", team, false).await;
  let colleague = placed(&scratch, "colleague-a", elsewhere, false).await;
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
  // The room was opened by the opener, whose own BMO leads it.
  scratch.leaders.0.lock().unwrap().insert(ROOM, vec![opener]);

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let entry = |actor: i32, user: i32, room: i64| json!({ "room": room, "actor": actor.to_string(), "user": user.to_string() });
  let allowed = |said: (StatusCode, Value)| {
    assert_eq!(said.0, StatusCode::OK, "{}", said.1);
    said.1["allowed"].as_bool().unwrap()
  };

  // The opener lets a colleague of another unit in, with no consent of that unit's head.
  let said = sent(&app, Method::POST, "/checks/entry", None, Some(entry(opener, colleague, ROOM))).await;

  assert_eq!(said.1["grant"], json!(format!("bmo_room:{ROOM}#entry")));
  assert!(allowed(said));
  // A head of the opener's unit may; a member who neither opened it nor heads the opener's unit may not.
  assert!(allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(head, colleague, ROOM))).await
  ));
  assert!(!allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(colleague, head, ROOM))).await
  ));
  // Nobody lets a person of another company in, the administrator neither.
  assert!(!allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(opener, outsider, ROOM))).await
  ));
  assert!(!allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(admin, outsider, ROOM))).await
  ));
  assert!(allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(admin, colleague, ROOM))).await
  ));

  // A room with no leader is bounded by the actor's company, but for the administrator.
  let leaderless = ROOM - 1;

  assert!(!allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(head, colleague, leaderless))).await
  ));
  assert!(allowed(
    sent(&app, Method::POST, "/checks/entry", None, Some(entry(admin, outsider, leaderless))).await
  ));

  let missing = sent(&app, Method::POST, "/checks/entry", None, Some(entry(opener, 9999, ROOM))).await;

  assert_eq!(missing.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn the_administrator_links_a_sender_to_a_user_once_and_never_moves_one_linked_elsewhere() {
  ready();
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
    },
  )
  .await
  .unwrap();

  let company = unit(&scratch, "company-a", None).await;
  let member = placed(&scratch, "member-a", company, false).await;
  let another = placed(&scratch, "member-b", company, false).await;
  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let identity: i64 = 9_000_000_000_001;
  let path = |user: i32| format!("/users/{user}/senders/{identity}");

  assert_eq!(
    sent(&app, Method::PUT, &path(member), Some("member"), None).await.0,
    StatusCode::FORBIDDEN
  );
  assert_eq!(
    sent(&app, Method::PUT, &path(member), Some("administrator"), None).await.0,
    StatusCode::NO_CONTENT
  );
  // Asked again, the link stands as it was.
  assert_eq!(
    sent(&app, Method::PUT, &path(member), Some("administrator"), None).await.0,
    StatusCode::NO_CONTENT
  );

  let senders = sent(&app, Method::GET, &format!("/users/{member}/senders"), None, None).await;

  assert_eq!(senders.1["senders"], json!([identity]));

  let moved = sent(&app, Method::PUT, &path(another), Some("administrator"), None).await;

  assert_eq!(moved.0, StatusCode::CONFLICT);
  assert_eq!(moved.1["code"], json!("sender-linked"));
  assert_eq!(
    sent(&app, Method::PUT, &path(9999), Some("administrator"), None).await.0,
    StatusCode::NOT_FOUND
  );
}
