//! Signing in through the service as the console does: the moved account's hash, made the way the console
//! makes it, signs in with the same password, and the session it is handed names that user; the moment of a
//! sign-in that answered with a session is kept and the people roster reports it, and a refused one keeps
//! nothing. The sessions stand on the machine's Valkey, in a database of the tests' own.

// A target of its own (bmo-chat's docs/conventions.md, 「Rust builds」): sumida reads its settings once per
// process, at its first reading, and this test sets them to its own database and Valkey database before that
// reading, which in the main target another test's router would have made first.

#[allow(dead_code)]
#[path = "../support/mod.rs"]
mod support;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::{SignInSet, set_sign_in, user_subject};
use http_body_util::BodyExt;
use sumida::api::authz::Authz;
use support::{Scratch, console_hash};
use tower::ServiceExt;

fn sign_in(name: &str, password: &str) -> Request<Body> {
  Request::post("/sign-ins")
    .header(header::CONTENT_TYPE, "application/json")
    .header(header::AUTHORIZATION, "Bearer a token")
    .header("x-real-ip", "127.0.0.1")
    .body(Body::from(format!(r#"{{"login":"{name}","password":"{password}"}}"#)))
    .unwrap()
}

#[tokio::test]
async fn the_moved_account_signs_in_with_its_own_password() {
  let scratch = Scratch::new().await;

  // sumida reads its settings once, at its first reading; the one test of its process sets them first.
  // SAFETY: nothing else in this process reads the environment yet.
  unsafe {
    std::env::set_var("SUMIDA_SETTINGS", concat!(env!("CARGO_MANIFEST_DIR"), "/sumida.toml"));
    std::env::set_var("SUMIDA_DATABASE__URL", scratch.address());
    std::env::set_var("SUMIDA_SESSION__REDIS__URL", "redis://127.0.0.1:6379/14");
  }

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![1],
      rooms: vec![],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();

  let app = in_force(scratch.service.clone(), "a token".into()).await.unwrap();
  let refused = app.clone().oneshot(sign_in("boss", "not the password")).await.unwrap();

  assert_eq!(refused.status(), StatusCode::UNAUTHORIZED);
  // A refused sign-in keeps no moment.
  assert_eq!(scratch.count(r#"SELECT count(*) FROM "user_sign_ins""#, vec![]).await, 0);

  let signed = app.clone().oneshot(sign_in("boss", "the password")).await.unwrap();

  assert_eq!(signed.status(), StatusCode::OK);

  // The sign-in that answered with a session keeps its moment, and the roster reports it.
  let boss = scratch
    .count(r#"SELECT "id"::bigint FROM "users" WHERE "username" = 'boss'"#, vec![])
    .await;
  let kept = scratch
    .count(r#"SELECT "signed_in_at" FROM "user_sign_ins" WHERE "user_id" = $1"#, vec![boss.into()])
    .await;
  let roster = app
    .clone()
    .oneshot(
      Request::get(format!("/people/{boss}"))
        .header(header::AUTHORIZATION, "Bearer a token")
        .header("owner-key", boss.to_string())
        .body(Body::empty())
        .unwrap(),
    )
    .await
    .unwrap();

  assert_eq!(roster.status(), StatusCode::OK);

  let body = roster.into_body().collect().await.unwrap().to_bytes();
  let said: serde_json::Value = serde_json::from_slice(&body).unwrap();

  assert_eq!(said["lastSignInAt"], kept, "{said}");

  let cookie = signed
    .headers()
    .get(header::SET_COOKIE)
    .and_then(|value| value.to_str().ok())
    .and_then(|value| value.split(';').next())
    .expect("a session cookie")
    .to_owned();

  assert!(cookie.starts_with("bmo.sid="), "{cookie}");

  let me = app
    .clone()
    .oneshot(
      Request::get("/sumida/me")
        .header(header::COOKIE, &cookie)
        .header("x-real-ip", "127.0.0.1")
        .body(Body::empty())
        .unwrap(),
    )
    .await
    .unwrap();

  assert_eq!(me.status(), StatusCode::OK);

  let body = me.into_body().collect().await.unwrap().to_bytes();
  let said: serde_json::Value = serde_json::from_slice(&body).unwrap();

  assert_eq!(said["username"], "boss", "{said}");

  let out = app
    .clone()
    .oneshot(
      Request::delete("/sumida/auth/session")
        .header(header::COOKIE, &cookie)
        .header("x-real-ip", "127.0.0.1")
        .body(Body::empty())
        .unwrap(),
    )
    .await
    .unwrap();

  assert_eq!(out.status(), StatusCode::OK);

  // The account command: a user made signs in with its password, holds nothing until it is asked to be the
  // administrator, and a second call on the same name changes the password alone.
  let made = set_sign_in(scratch.db(), "tester", "first password", false).await.unwrap();

  assert!(made.made);
  assert!(
    !Authz::is_superuser(&user_subject(scratch.db(), made.user).await.unwrap(), scratch.db())
      .await
      .unwrap()
  );
  assert_eq!(
    app.clone().oneshot(sign_in("tester", "first password")).await.unwrap().status(),
    StatusCode::OK
  );

  let reset = set_sign_in(scratch.db(), "tester", "second password", true).await.unwrap();

  assert_eq!(
    reset,
    SignInSet {
      user: made.user,
      made: false
    }
  );
  assert!(
    Authz::is_superuser(&user_subject(scratch.db(), made.user).await.unwrap(), scratch.db())
      .await
      .unwrap()
  );
  assert_eq!(
    app.clone().oneshot(sign_in("tester", "first password")).await.unwrap().status(),
    StatusCode::UNAUTHORIZED
  );
  assert_eq!(
    app.oneshot(sign_in("tester", "second password")).await.unwrap().status(),
    StatusCode::OK
  );
}
