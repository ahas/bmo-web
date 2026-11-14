//! Every route of `docs/boundary.md`'s 「What the server serves」 but the fixed lines, asked over the router as
//! a caller asks it: with the token, in snake_case JSON, a user named by a string; and the receiver's client
//! against a stand-in receiver.

use crate::support;

use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::routing::{get, put};
use axum::{Json, Router};
use bmo_web_server::data_move::{MoveAsk, RoomRule, run_move};
use bmo_web_server::holdings::HOLDINGS;
use bmo_web_server::receiver::{Receiver, ReceiverClient};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::{set_sign_in, user_for_sender};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use support::{OWNER, ROOM, Scratch, SharedDatabase, console_hash, ready};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";
const MEMBER: i64 = 777;
const OTHER: i64 = -200;
const UNANSWERED: i64 = -300;

/// A database the move has run on, with the owner's account, two rooms the deployment answers, a room rule
/// for a member in the first, and messages in both. Shared by the tests that only read or grant to holders
/// of their own.
async fn moved() -> Scratch {
  static SHARED: SharedDatabase = SharedDatabase::new();

  SHARED.get(seed).await
}

async fn seed(scratch: Scratch) -> Scratch {
  scratch.console_account("boss", &console_hash("the password")).await;
  for (room, message, sender) in [(ROOM, 1, OWNER), (ROOM, 2, MEMBER), (OTHER, 1, OWNER)] {
    scratch.message(room, message, sender);
  }
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![ROOM, OTHER],
      room_rules: vec![RoomRule {
        room: ROOM,
        id: "a-rule".into(),
        subject: MEMBER,
        words: "may have their own items approved".into(),
      }],
    },
  )
  .await
  .unwrap();

  scratch
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

/// A request with the token, and the status and body it is answered with.
async fn ask(app: &Router, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
  asked(app, method, path, body, Some(TOKEN)).await
}

async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  token: Option<&str>,
) -> (StatusCode, Value) {
  let mut request = Request::builder().method(method).uri(path).header("x-real-ip", "127.0.0.1");

  if let Some(token) = token {
    request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
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

async fn owner_user(app: &Router) -> String {
  let (status, said) = ask(app, Method::GET, &format!("/senders/{OWNER}/user"), None).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  said["user"].as_str().expect("a user's id is a string").to_owned()
}

#[tokio::test]
async fn the_health_answers_without_a_token_and_every_other_route_refuses_without_it() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let (status, said) = asked(&app, Method::GET, "/health", None, None).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(said["ok"], true);
  assert_eq!(said["inForce"], true);
  assert_eq!(said["version"], bmo_web_server::VERSION);

  for (method, path) in [
    (Method::GET, "/accounts/model"),
    (Method::POST, "/accounts/move"),
    (Method::GET, "/senders/42/user"),
    (Method::POST, "/checks/room"),
    (Method::GET, "/grants?room=-100"),
    (Method::GET, "/rooms/-100/holdings"),
    (Method::GET, "/users/1/secrets"),
    (Method::PUT, "/users/1/secrets/a-name"),
    (Method::GET, "/secret-kinds"),
    (Method::POST, "/secret-kinds"),
  ] {
    for token in [None, Some("not the token")] {
      let (status, said) = asked(&app, method.clone(), path, None, token).await;

      assert_eq!(status, StatusCode::UNAUTHORIZED, "{method} {path}");
      assert_eq!(said["code"], "unauthorized", "{said}");
      assert!(said["error"].is_string(), "{said}");
    }
  }
}

#[tokio::test]
async fn the_model_stands_once_the_move_is_written_and_nothing_needing_it_answers_before() {
  ready();
  let scratch = Scratch::new().await;
  let app = app(&scratch).await;

  scratch.console_account("boss", &console_hash("the password")).await;

  let (status, said) = ask(&app, Method::GET, "/accounts/model", None).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(said["inForce"], false);
  assert!(said["why"].is_string(), "{said}");

  let (status, said) =
    ask(&app, Method::POST, "/checks/room", Some(json!({ "room": ROOM, "relation": "ask" }))).await;

  assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
  assert_eq!(said["code"], "not-in-force", "{said}");

  let the_move = json!({ "ownerSenders": [OWNER], "rooms": [ROOM] });
  let (status, said) = ask(&app, Method::POST, "/accounts/move", Some(the_move.clone())).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!((said["done"].clone(), said["written"].clone()), (json!(true), json!(true)));
  assert!(said["administrator"].is_string(), "{said}");
  assert_eq!(ask(&app, Method::GET, "/accounts/model", None).await.1["inForce"], true);

  let (_, again) = ask(&app, Method::POST, "/accounts/move", Some(the_move)).await;

  assert_eq!(again["written"], false);
  assert_eq!(
    ask(&app, Method::POST, "/checks/room", Some(json!({ "room": ROOM, "relation": "ask" })))
      .await
      .0,
    StatusCode::OK
  );
}

#[tokio::test]
async fn a_sender_names_its_user_and_a_user_names_its_senders() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let user = owner_user(&app).await;
  let (status, said) = ask(&app, Method::GET, "/senders/9999/user", None).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(said["code"], "not-found");

  let (status, said) = ask(&app, Method::GET, &format!("/users/{user}"), None).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["user"], user);
  assert_eq!(said["name"], "boss");
  assert_eq!(said["administrator"], true);
  assert_eq!(said["senders"], json!([OWNER]));

  let (status, said) = ask(&app, Method::GET, &format!("/users/{user}/senders"), None).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(said["senders"], json!([OWNER]));
  assert_eq!(ask(&app, Method::GET, "/users/987654/senders", None).await.0, StatusCode::NOT_FOUND);
  assert_eq!(ask(&app, Method::GET, "/users/someone", None).await.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn the_senders_asked_answer_their_users_and_whether_each_may_sign_in() {
  ready();
  let scratch = moved().await;
  // A sender a grant gave a user, which has no way to sign in.
  const GRANTED: i64 = 4321;
  let granted = user_for_sender(scratch.db(), GRANTED).await.unwrap();
  let app = app(&scratch).await;
  let user = owner_user(&app).await;
  let body = json!({ "senders": [9999, GRANTED, OWNER, GRANTED] });
  let (status, said) = ask(&app, Method::POST, "/senders/users", Some(body)).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    said["links"],
    json!([
      { "sender": GRANTED, "user": granted.to_string(), "signsIn": false },
      { "sender": OWNER, "user": user, "signsIn": true },
    ])
  );

  let (status, said) = ask(&app, Method::POST, "/senders/users", Some(json!({ "senders": [] }))).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!(said["links"], json!([]));
  assert_eq!(
    ask(&app, Method::POST, "/senders/users", Some(json!({ "senders": "all" }))).await.0,
    StatusCode::BAD_REQUEST
  );
}

#[tokio::test]
async fn a_password_changes_on_the_current_one_and_a_name_another_user_holds_is_refused() {
  ready();
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();
  set_sign_in(scratch.db(), "someone else", "their password", false).await.unwrap();

  let app = app(&scratch).await;
  let user = owner_user(&app).await;
  let path = format!("/users/{user}/password");
  let (status, said) = ask(
    &app,
    Method::POST,
    &path,
    Some(json!({ "current": "wrong", "next": "the next password" })),
  )
  .await;

  assert_eq!(status, StatusCode::UNAUTHORIZED);
  assert_eq!(said["code"], "wrong-password");
  assert_eq!(
    ask(
      &app,
      Method::POST,
      &path,
      Some(json!({ "current": "the password", "next": "the next password" }))
    )
    .await
    .0,
    StatusCode::NO_CONTENT
  );

  let path = format!("/users/{user}/name");
  let (status, said) = ask(&app, Method::POST, &path, Some(json!({ "name": "someone else" }))).await;

  assert_eq!(status, StatusCode::CONFLICT);
  assert_eq!(said["code"], "name-taken");
  assert_eq!(
    ask(&app, Method::POST, &path, Some(json!({ "name": "the boss" }))).await.0,
    StatusCode::NO_CONTENT
  );
  assert_eq!(ask(&app, Method::GET, &format!("/users/{user}"), None).await.1["name"], "the boss");
}

#[tokio::test]
async fn the_checks_answer_for_a_room_a_message_and_an_object() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let user = owner_user(&app).await;
  let (status, said) = ask(
    &app,
    Method::POST,
    "/checks/room",
    Some(json!({ "room": ROOM, "sender": MEMBER, "relation": "deploy" })),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["allowed"], true, "the member's standing rule opens every relation of the room");
  assert_eq!(said["grant"], format!("bmo_room:{ROOM}#deploy"));
  assert!(said["user"].is_string());

  let (_, said) = ask(
    &app,
    Method::POST,
    "/checks/room",
    Some(json!({ "room": UNANSWERED, "relation": "ask" })),
  )
  .await;

  assert_eq!(said["allowed"], false);
  assert_eq!(said["user"], Value::Null);

  let (status, said) = ask(
    &app,
    Method::POST,
    "/checks/message",
    Some(json!({ "room": ROOM, "message": 2, "relation": "launch" })),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!((said["allowed"].clone(), said["sender"].clone()), (json!(true), json!(MEMBER)));

  let (status, said) = ask(
    &app,
    Method::POST,
    "/checks/message",
    Some(json!({ "room": OTHER, "message": 9, "relation": "launch" })),
  )
  .await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(said["code"], "no-such-message");

  let (status, said) = ask(
    &app,
    Method::POST,
    "/checks/object",
    Some(json!({ "kind": "bmo_worker", "object": "worker", "relation": "run", "user": user })),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said, json!({ "allowed": true, "grant": "bmo_worker:worker#run" }));

  let (status, said) = ask(
    &app,
    Method::POST,
    "/checks/object",
    Some(json!({ "kind": "bmo_worker", "object": "worker", "relation": "fly", "user": user })),
  )
  .await;

  assert_eq!(status, StatusCode::BAD_REQUEST, "a relation the rules do not declare: {said}");
}

#[tokio::test]
async fn a_grant_is_made_listed_and_revoked_on_a_message_of_its_room() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let holder = 8_101;
  let grant = json!({
    "room": ROOM,
    "relation": "launch",
    "to": { "sender": holder },
    "words": "may launch the room's jobs",
    "message": { "room": ROOM, "id": 1 },
  });
  let (status, said) = ask(&app, Method::POST, "/grants", Some(grant)).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["grant"], format!("bmo_room:{ROOM}#launch"));

  let user = said["user"].as_str().expect("the holder's user").to_owned();
  let (status, said) = ask(&app, Method::GET, &format!("/grants?room={ROOM}"), None).await;

  assert_eq!(status, StatusCode::OK);

  let listed = said["grants"].as_array().unwrap();
  let made = listed
    .iter()
    .find(|one| one["subjectKey"] == format!("user:{user}"))
    .expect("the grant stands");

  assert_eq!(made["relation"], "launch");
  assert_eq!(made["words"], "may launch the room's jobs");
  assert_eq!(made["expiresAt"], Value::Null);
  assert!(listed.iter().any(|one| one["subjectKey"] == format!("bmo_member:{ROOM}")));

  // By a member, who holds no authority to grant.
  let refused = json!({
    "room": ROOM, "relation": "deploy", "to": { "user": user }, "message": { "room": ROOM, "id": 2 },
  });

  assert_eq!(ask(&app, Method::POST, "/grants", Some(refused)).await.0, StatusCode::FORBIDDEN);

  let revoke = json!({
    "room": ROOM, "relation": "launch", "to": { "user": user }, "message": { "room": ROOM, "id": 1 },
  });
  let (status, said) = ask(&app, Method::DELETE, "/grants", Some(revoke)).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["revoked"], 1);

  let (_, said) = ask(&app, Method::GET, &format!("/grants?room={ROOM}"), None).await;

  assert!(
    !said["grants"]
      .as_array()
      .unwrap()
      .iter()
      .any(|one| one["subjectKey"] == format!("user:{user}"))
  );
}

#[tokio::test]
async fn a_phone_key_is_made_read_adopted_and_taken_away() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let user = owner_user(&app).await;
  let (status, made) = ask(&app, Method::POST, "/phones", Some(json!({ "user": user }))).await;

  assert_eq!(status, StatusCode::OK, "{made}");

  let (status, held) = ask(&app, Method::POST, "/phones/who", Some(json!({ "key": made["key"] }))).await;

  assert_eq!(status, StatusCode::OK);
  assert_eq!((held["user"].clone(), held["name"].clone()), (json!(user), json!("boss")));

  let token = "a-token-issued-before-the-model-for-the-routes-0123";
  let (status, adopted) =
    ask(&app, Method::POST, "/phones/adopt", Some(json!({ "token": token, "user": user }))).await;

  assert_eq!(status, StatusCode::OK, "{adopted}");
  assert_eq!(
    ask(&app, Method::POST, "/phones/who", Some(json!({ "key": token }))).await.1["hash"],
    adopted["hash"]
  );

  let path = format!("/phones/{}", made["hash"].as_str().unwrap());

  assert_eq!(ask(&app, Method::DELETE, &path, None).await.0, StatusCode::NO_CONTENT);
  assert_eq!(
    ask(&app, Method::POST, "/phones/who", Some(json!({ "key": made["key"] }))).await.0,
    StatusCode::UNAUTHORIZED
  );
}

#[tokio::test]
async fn a_room_names_what_it_holds_and_a_room_with_nothing_names_nothing() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let (status, said) = ask(&app, Method::GET, &format!("/rooms/{ROOM}/holdings"), None).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  let holdings = said["holdings"].as_array().unwrap();
  let count = |code: &str| holdings.iter().find(|one| one["code"] == code).map(|one| one["count"].clone());

  assert!(
    count("room_grants").and_then(|count| count.as_i64()).is_some_and(|count| count > 0),
    "{said}"
  );
  assert!(
    count("room_senders").and_then(|count| count.as_i64()).is_some_and(|count| count >= 1),
    "{said}"
  );

  let (_, said) = ask(&app, Method::GET, &format!("/rooms/{UNANSWERED}/holdings"), None).await;

  assert_eq!(said["holdings"], json!([]));
}

#[tokio::test]
async fn a_body_that_does_not_read_is_refused_naming_why() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let (status, said) = ask(&app, Method::POST, "/checks/room", Some(json!({ "room": "a room" }))).await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(said["code"], "bad-request");
  assert!(said["error"].as_str().unwrap().contains("the body does not read"), "{said}");
}

/// What the stand-in receiver was asked: the declarations it took.
#[derive(Clone, Default)]
struct Heard(Arc<Mutex<Vec<(String, Value)>>>);

async fn stand_in_receiver() -> (String, Heard) {
  let heard = Heard::default();
  let kept = heard.clone();
  let app = Router::new()
    .route(
      "/rooms/{chat}/messages/{message}",
      get(|axum::extract::Path((chat, message)): axum::extract::Path<(i64, i64)>| async move {
        if (chat, message) == (ROOM, 1) {
          Ok(Json(json!({ "sender": OWNER, "sent_at": 1, "text": "words" })))
        } else {
          Err(StatusCode::NOT_FOUND)
        }
      }),
    )
    .route(
      "/room-holders/{unit}",
      put(
        move |axum::extract::Path(unit): axum::extract::Path<String>,
              headers: axum::http::HeaderMap,
              Json(body): Json<Value>| {
          let kept = kept.clone();

          async move {
            if headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok())
              != Some("Bearer the receiver's token")
            {
              return StatusCode::UNAUTHORIZED;
            }
            kept.0.lock().unwrap().push((unit, body));

            StatusCode::NO_CONTENT
          }
        },
      ),
    );
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let address = format!("http://{}", listener.local_addr().unwrap());

  tokio::spawn(async move { axum::serve(listener, app).await });

  (address, heard)
}

#[tokio::test]
async fn the_receivers_client_reads_a_senders_message_and_declares_the_holder() {
  ready();
  let (address, heard) = stand_in_receiver().await;
  let client = ReceiverClient::new(&address, "the receiver's token").unwrap();

  assert_eq!(client.sender_of(ROOM, 1).await.unwrap(), Some(OWNER));
  assert_eq!(client.sender_of(ROOM, 2).await.unwrap_err().code, "no-such-message");

  client.declare_holder("web", "http://127.0.0.1:3240", &HOLDINGS).await.unwrap();

  let heard = heard.0.lock().unwrap().clone();

  assert_eq!(heard.len(), 1);
  assert_eq!(heard[0].0, "web");
  assert_eq!(
    heard[0].1,
    json!({
      "address": "http://127.0.0.1:3240",
      "holdings": [
        { "name": "room_grants", "effect": "warns" },
        { "name": "room_senders", "effect": "kept" },
      ],
    })
  );
  assert!(ReceiverClient::new("https://elsewhere.example", "a token").is_err());
}

#[tokio::test]
async fn the_rooms_a_console_has_open_are_put_and_read_for_the_receiver() {
  ready();

  let scratch = moved().await;
  let app = app(&scratch).await;

  let (status, put) = ask(&app, Method::PUT, "/watching", Some(json!({ "rooms": [2, 1, 2] }))).await;

  assert_eq!(status, StatusCode::OK, "{put}");
  assert_eq!(put["rooms"], json!([1, 2]), "sorted and without a repeat");

  let (status, read) = ask(&app, Method::GET, "/watching", None).await;

  assert_eq!(status, StatusCode::OK, "{read}");
  assert_eq!(read["rooms"], json!(put["rooms"]));
  assert!(read["at"].is_i64(), "the moment the console last said so stands");
}
