//! Account security (docs/accounts.md, 「Account security」; docs/boundary.md, 「Account security」), asked over the
//! router as the console asks it, with a stand-in bmo-mail that keeps every mail it is handed: the system mail, an
//! email's verification, the sign-in with its guard and its second factor, a password set again by a link, the
//! administrator's and a head's acts on an account, and the devices a person ends.

use crate::support;

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Method, Request, StatusCode, header};
use bmo_web_client::MailServer;
use bmo_web_server::Refusal;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::security::mail::{MailService, Outgoing};
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use support::{Scratch, console_hash, ready};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";
const BASE: &str = "https://console.example.com";

/// A stand-in bmo-mail: one outgoing server, and every mail it is handed kept.
#[derive(Clone, Default)]
struct Mailbox(Arc<Mutex<Vec<Outgoing>>>);

#[async_trait::async_trait]
impl MailService for Mailbox {
  async fn servers(&self) -> Result<Vec<MailServer>, Refusal> {
    Ok(vec![MailServer {
      id: "server-a".into(),
      name: "Relay A".into(),
      host: "relay.example.com".into(),
    }])
  }

  async fn send(&self, mail: &Outgoing) -> Result<(), Refusal> {
    self.0.lock().unwrap().push(mail.clone());

    Ok(())
  }
}

impl Mailbox {
  fn kinds(&self) -> Vec<String> {
    self.0.lock().unwrap().iter().map(|mail| mail.kind.clone()).collect()
  }

  /// The token the last mail of a kind carries in its link.
  fn token(&self, kind: &str) -> String {
    let mails = self.0.lock().unwrap();
    let mail = mails.iter().rev().find(|mail| mail.kind == kind).expect("a mail of the kind");
    let at = mail.text.find("token=").expect("a link") + "token=".len();

    mail.text[at..].split_whitespace().next().unwrap().to_owned()
  }
}

struct World {
  scratch: Scratch,
  app: Router,
  mailbox: Mailbox,
  boss: i32,
  member: i32,
}

/// A database the move has run on, its administrator, one member, and the stand-in bmo-mail.
async fn world() -> World {
  ready();

  let mut scratch = Scratch::new().await;

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
  let boss = moved.administrator.expect("the move names the administrator");
  let member = set_sign_in(scratch.db(), "member-a", "member password", false).await.unwrap().user;
  let mailbox = Mailbox::default();

  scratch.service = scratch.service.clone().sending_mail(Arc::new(mailbox.clone()));

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();

  World {
    scratch,
    app,
    mailbox,
    boss,
    member,
  }
}

/// One call's answer: its status, its headers and its body.
struct Answered {
  status: StatusCode,
  headers: HeaderMap,
  body: Value,
}

impl Answered {
  /// The session cookie the answer sets, as `name=value`.
  fn cookie(&self) -> Option<String> {
    self
      .headers
      .get(header::SET_COOKIE)
      .and_then(|value| value.to_str().ok())
      .and_then(|value| value.split(';').next())
      .map(str::to_owned)
  }
}

async fn ask(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  headers: &[(&str, String)],
) -> Answered {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "203.0.113.7")
    .header(header::USER_AGENT, "Browser/1.0 (System 2)")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

  for (name, value) in headers {
    request = request.header(*name, value);
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
  let headers = answer.headers().clone();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let body = if bytes.is_empty() {
    Value::Null
  } else {
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
  };

  Answered {
    status,
    headers,
    body,
  }
}

fn by(user: i32) -> Vec<(&'static str, String)> {
  vec![("owner-key", user.to_string())]
}

/// Whether a session cookie still names a live session, as the console asks.
async fn live(app: &Router, cookie: &str) -> bool {
  let request = Request::get("/sumida/me")
    .header("x-real-ip", "203.0.113.7")
    .header(header::COOKIE, cookie)
    .body(Body::empty())
    .unwrap();

  app.clone().oneshot(request).await.unwrap().status() == StatusCode::OK
}

/// The system mail set: bmo-mail's server, a sender, and no secret.
async fn mail_set(world: &World) {
  let set = ask(
    &world.app,
    Method::PUT,
    "/mail",
    Some(json!({ "server": "server-a", "from": "system@example.com", "fromName": "BMO", "secret": null })),
    &by(world.boss),
  )
  .await;

  assert_eq!(set.status, StatusCode::OK, "{}", set.body);
  assert_eq!(set.body["configured"], json!(true));
}

/// The member's email kept and verified through its link.
async fn verified(world: &World, user: i32, email: &str) {
  let profile = json!({ "fullName": "", "jobTitle": "", "landline": "", "mobile": "", "email": email });
  let saved = ask(
    &world.app,
    Method::POST,
    &format!("/users/{user}/profile"),
    Some(profile),
    &[("owner-key", user.to_string()), ("owner-role", "member".into())],
  )
  .await;

  assert_eq!(saved.status, StatusCode::OK, "{}", saved.body);

  let sent = ask(
    &world.app,
    Method::POST,
    &format!("/users/{user}/email/verification"),
    Some(json!({ "linkBase": BASE })),
    &by(user),
  )
  .await;

  assert_eq!(sent.status, StatusCode::NO_CONTENT, "{}", sent.body);

  let used = ask(
    &world.app,
    Method::POST,
    &format!("/email-verifications/{}", world.mailbox.token("email-verification")),
    None,
    &[],
  )
  .await;

  assert_eq!(used.status, StatusCode::OK, "{}", used.body);
}

async fn sign_in(world: &World, login: &str, password: &str) -> Answered {
  ask(
    &world.app,
    Method::POST,
    "/sign-ins",
    Some(json!({ "login": login, "password": password })),
    &[],
  )
  .await
}

/// The code an authenticator shows now for a base32 secret.
fn code(secret: &str, step_offset: i64) -> String {
  let totp = totp_rs::Builder::new()
    .with_secret(totp_rs::Secret::try_from_base32(secret).unwrap())
    .build()
    .unwrap();
  let now = chrono::Utc::now().timestamp() + step_offset * 30;

  totp.generate(u64::try_from(now).unwrap()).to_string()
}

#[tokio::test]
async fn the_system_mail_is_the_administrators_and_names_its_secret_alone() {
  let world = world().await;

  let refused = ask(&world.app, Method::GET, "/mail", None, &by(world.member)).await;

  assert_eq!(refused.status, StatusCode::FORBIDDEN);

  let unset = ask(
    &world.app,
    Method::POST,
    "/mail/test",
    Some(json!({ "to": "a@example.com" })),
    &by(world.boss),
  )
  .await;

  assert_eq!(unset.body["code"], json!("mail-unset"), "{}", unset.body);

  mail_set(&world).await;

  let read = ask(&world.app, Method::GET, "/mail", None, &by(world.boss)).await;

  assert_eq!(read.body["servers"][0]["id"], json!("server-a"));
  assert_eq!(read.body["mailService"], json!(true));

  let tested = ask(
    &world.app,
    Method::POST,
    "/mail/test",
    Some(json!({ "to": "a@example.com" })),
    &by(world.boss),
  )
  .await;

  assert_eq!(tested.status, StatusCode::NO_CONTENT, "{}", tested.body);
  assert_eq!(world.mailbox.kinds(), vec!["test"]);
  assert!(world.mailbox.0.lock().unwrap()[0].html.contains("a@example.com"));
}

#[tokio::test]
async fn an_email_is_verified_by_its_link_and_a_change_of_it_undoes_that() {
  let world = world().await;

  mail_set(&world).await;
  verified(&world, world.member, "member@example.com").await;

  let read = ask(
    &world.app,
    Method::GET,
    &format!("/users/{}/security", world.member),
    None,
    &by(world.member),
  )
  .await;

  assert_eq!(read.body["emailVerified"], json!(true), "{}", read.body);

  let profile =
    json!({ "fullName": "", "jobTitle": "", "landline": "", "mobile": "", "email": "other@example.com" });
  ask(
    &world.app,
    Method::POST,
    &format!("/users/{}/profile", world.member),
    Some(profile),
    &[("owner-key", world.member.to_string()), ("owner-role", "member".into())],
  )
  .await;

  let read = ask(
    &world.app,
    Method::GET,
    &format!("/users/{}/security", world.member),
    None,
    &by(world.member),
  )
  .await;

  assert_eq!(read.body["emailVerified"], json!(false), "{}", read.body);
}

#[tokio::test]
async fn a_sign_in_refuses_a_wrong_password_as_it_refuses_nobody_and_makes_a_session_for_the_right_one() {
  let world = world().await;

  let nobody = sign_in(&world, "nobody-at-all", "member password").await;
  let wrong = sign_in(&world, "member-a", "not the password").await;

  assert_eq!(nobody.status, StatusCode::UNAUTHORIZED);
  assert_eq!(nobody.body["code"], wrong.body["code"]);
  assert_eq!(wrong.body["code"], json!("wrong-credentials"));

  let signed = sign_in(&world, "member-a", "member password").await;

  assert_eq!(signed.status, StatusCode::OK, "{}", signed.body);
  assert_eq!(signed.body["outcome"], json!("signed-in"));
  assert_eq!(signed.body["user"], json!(world.member.to_string()));

  let cookie = signed.cookie().expect("a session cookie");

  assert!(live(&world.app, &cookie).await);

  let tries = ask(
    &world.app,
    Method::GET,
    &format!("/users/{}/sign-ins", world.member),
    None,
    &by(world.member),
  )
  .await;
  let outcomes: Vec<&str> = tries.body["tries"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one["outcome"].as_str().unwrap())
    .collect();

  assert_eq!(outcomes, vec!["signed-in", "wrong-password"]);

  // sumida's own sign-in is closed.
  let closed = Request::post("/sumida/auth/session")
    .header(header::CONTENT_TYPE, "application/json")
    .header("x-real-ip", "203.0.113.7")
    .body(Body::from(r#"{"username":"member-a","password":"member password"}"#))
    .unwrap();

  assert_eq!(world.app.clone().oneshot(closed).await.unwrap().status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn failures_in_a_row_make_a_login_wait_and_the_tenth_locks_it_with_one_mail() {
  let world = world().await;

  mail_set(&world).await;
  verified(&world, world.member, "member@example.com").await;

  for _ in 0..3 {
    assert_eq!(sign_in(&world, "member-a", "wrong").await.status, StatusCode::UNAUTHORIZED);
  }

  let waits = sign_in(&world, "member-a", "member password").await;

  assert_eq!(waits.status, StatusCode::TOO_MANY_REQUESTS, "{}", waits.body);
  assert!(waits.headers.contains_key(header::RETRY_AFTER));

  // Nine failures in a row, the last of them past its wait, then the tenth locks the login.
  world.scratch.run(r#"DELETE FROM "sign_in_tries""#, vec![]).await;
  world
    .scratch
    .run(
      r#"INSERT INTO "sign_in_tries" ("login", "user_id", "address", "user_agent", "outcome", "failure", "at")
         SELECT 'member-a', $1::bigint, '198.51.100.9', 'x', 'wrong-password', true, $2 + n * 1000
         FROM generate_series(1, 9) n"#,
      vec![world.member.into(), (chrono::Utc::now().timestamp_millis() - 200_000).into()],
    )
    .await;

  let tenth = sign_in(&world, "member-a", "wrong").await;

  assert_eq!(tenth.status, StatusCode::UNAUTHORIZED, "{}", tenth.body);

  let locked = sign_in(&world, "member-a", "member password").await;

  assert_eq!(locked.status, StatusCode::LOCKED, "{}", locked.body);
  assert_eq!(locked.body["code"], json!("locked"));
  assert_eq!(world.mailbox.kinds().iter().filter(|kind| *kind == "account-locked").count(), 1);
}

#[tokio::test]
async fn a_second_factor_is_enrolled_then_asked_at_the_sign_in_and_taken_once() {
  let world = world().await;
  let path = format!("/users/{}/second-factor", world.member);

  let refused = ask(&world.app, Method::POST, &path, None, &by(world.boss)).await;

  assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.body);

  let enrolment = ask(&world.app, Method::POST, &path, None, &by(world.member)).await;

  assert_eq!(enrolment.status, StatusCode::OK, "{}", enrolment.body);

  let secret = enrolment.body["secret"].as_str().unwrap().to_owned();

  assert!(enrolment.body["uri"].as_str().unwrap().starts_with("otpauth://totp/"));
  assert!(enrolment.body["qr"].as_str().unwrap().contains("<svg"));

  let wrong = ask(
    &world.app,
    Method::POST,
    &format!("{path}/confirm"),
    Some(json!({ "code": "000000" })),
    &by(world.member),
  )
  .await;

  assert_eq!(wrong.body["code"], json!("wrong-code"));

  let confirmed = ask(
    &world.app,
    Method::POST,
    &format!("{path}/confirm"),
    Some(json!({ "code": code(&secret, -1) })),
    &by(world.member),
  )
  .await;

  assert_eq!(confirmed.status, StatusCode::OK, "{}", confirmed.body);

  let codes: Vec<String> = confirmed.body["recoveryCodes"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one.as_str().unwrap().to_owned())
    .collect();

  assert_eq!(codes.len(), 10);

  let asked = sign_in(&world, "member-a", "member password").await;

  assert_eq!(asked.body["outcome"], json!("second-factor"), "{}", asked.body);
  assert!(asked.cookie().is_none());

  let ticket = asked.body["ticket"].as_str().unwrap().to_owned();
  let finished = ask(
    &world.app,
    Method::POST,
    "/sign-ins/second-factor",
    Some(json!({ "ticket": ticket, "code": code(&secret, 0), "remember": true })),
    &[],
  )
  .await;

  assert_eq!(finished.status, StatusCode::OK, "{}", finished.body);
  assert!(finished.cookie().is_some());

  let device = finished.body["deviceToken"].as_str().unwrap().to_owned();

  // The same code is taken once.
  let again = sign_in(&world, "member-a", "member password").await;
  let ticket = again.body["ticket"].as_str().unwrap().to_owned();
  let reused = ask(
    &world.app,
    Method::POST,
    "/sign-ins/second-factor",
    Some(json!({ "ticket": ticket, "code": code(&secret, 0), "remember": false })),
    &[],
  )
  .await;

  assert_eq!(reused.body["code"], json!("wrong-code"), "{}", reused.body);

  // A recovery code signs in once.
  let recovered = ask(
    &world.app,
    Method::POST,
    "/sign-ins/second-factor",
    Some(json!({ "ticket": ticket, "code": codes[0].to_lowercase(), "remember": false })),
    &[],
  )
  .await;

  assert_eq!(recovered.status, StatusCode::OK, "{}", recovered.body);

  // A remembered browser is asked no code.
  let remembered = ask(
    &world.app,
    Method::POST,
    "/sign-ins",
    Some(json!({ "login": "member-a", "password": "member password", "deviceToken": device })),
    &[],
  )
  .await;

  assert_eq!(remembered.body["outcome"], json!("signed-in"), "{}", remembered.body);

  // The administrator resets it, and the history keeps it.
  let reset = ask(&world.app, Method::DELETE, &path, None, &by(world.boss)).await;

  assert_eq!(reset.status, StatusCode::NO_CONTENT, "{}", reset.body);
  assert_eq!(sign_in(&world, "member-a", "member password").await.body["outcome"], json!("signed-in"));
  assert_eq!(
    world
      .scratch
      .count(r#"SELECT count(*) FROM "org_history" WHERE "change" = 'second-factor-reset'"#, vec![])
      .await,
    1
  );
}

#[tokio::test]
async fn a_forgotten_password_is_set_again_by_a_mailed_link_once_and_every_session_ends() {
  let world = world().await;

  mail_set(&world).await;
  verified(&world, world.member, "member@example.com").await;

  let session = sign_in(&world, "member-a", "member password").await.cookie().unwrap();

  for who in ["nobody-at-all", "MEMBER@example.com"] {
    let asked = ask(
      &world.app,
      Method::POST,
      "/password-resets",
      Some(json!({ "who": who, "linkBase": BASE })),
      &[],
    )
    .await;

    assert_eq!(asked.status, StatusCode::ACCEPTED);
  }

  assert_eq!(world.mailbox.kinds().iter().filter(|kind| *kind == "password-reset").count(), 1);

  let token = world.mailbox.token("password-reset");
  let read = ask(&world.app, Method::GET, &format!("/password-resets/{token}"), None, &[]).await;

  assert_eq!(read.body["login"], json!("member-a"));

  let weak = ask(
    &world.app,
    Method::POST,
    &format!("/password-resets/{token}"),
    Some(json!({ "password": "short" })),
    &[],
  )
  .await;

  assert_eq!(weak.body["code"], json!("weak-password"));

  let set = ask(
    &world.app,
    Method::POST,
    &format!("/password-resets/{token}"),
    Some(json!({ "password": "a new password" })),
    &[],
  )
  .await;

  assert_eq!(set.status, StatusCode::NO_CONTENT, "{}", set.body);
  assert!(!live(&world.app, &session).await);
  assert!(world.mailbox.kinds().contains(&"password-changed".to_owned()));

  let again = ask(
    &world.app,
    Method::POST,
    &format!("/password-resets/{token}"),
    Some(json!({ "password": "another password" })),
    &[],
  )
  .await;

  assert_eq!(again.body["code"], json!("link-gone"));
  assert_eq!(sign_in(&world, "member-a", "a new password").await.status, StatusCode::OK);
}

#[tokio::test]
async fn a_password_is_reset_by_the_administrator_or_a_head_handed_or_mailed_and_refused_to_anyone_else() {
  let world = world().await;
  let other = set_sign_in(world.scratch.db(), "member-b", "other password", false).await.unwrap().user;
  let path = format!("/users/{}/password-reset", world.member);
  let body = json!({ "linkBase": BASE });

  let refused = ask(&world.app, Method::POST, &path, Some(body.clone()), &by(other)).await;

  assert_eq!(refused.status, StatusCode::FORBIDDEN, "{}", refused.body);

  // No mail set up: the link is handed.
  let handed = ask(&world.app, Method::POST, &path, Some(body.clone()), &by(world.boss)).await;

  assert_eq!(handed.status, StatusCode::OK, "{}", handed.body);
  assert_eq!(handed.body["mailed"], json!(false));
  assert!(
    handed.body["link"]
      .as_str()
      .unwrap()
      .starts_with(&format!("{BASE}/reset-password?token="))
  );

  // A head of the person's company resets it too; with mail set up and the email verified, it is mailed.
  let company: i32 = world
    .scratch
    .count(
      r#"SELECT "organization_id"::bigint FROM "users" WHERE "id" = $1"#,
      vec![world.member.into()],
    )
    .await
    .try_into()
    .unwrap();
  let headed = ask(
    &world.app,
    Method::PUT,
    &format!("/units/{company}/heads/{other}"),
    None,
    &[("owner-key", world.boss.to_string()), ("owner-role", "administrator".into())],
  )
  .await;

  assert!(headed.status.is_success(), "{}", headed.body);

  mail_set(&world).await;
  verified(&world, world.member, "member@example.com").await;

  let mailed = ask(&world.app, Method::POST, &path, Some(body), &by(other)).await;

  assert_eq!(mailed.status, StatusCode::OK, "{}", mailed.body);
  assert_eq!(mailed.body["mailed"], json!(true));
  assert_eq!(mailed.body["address"], json!("m***@example.com"));
  assert_eq!(
    world
      .scratch
      .count(r#"SELECT count(*) FROM "org_history" WHERE "change" = 'password-reset'"#, vec![])
      .await,
    2
  );
}

#[tokio::test]
async fn a_device_ended_is_refused_by_the_session_check_and_the_others_end_with_this_one_kept() {
  let world = world().await;
  let first = sign_in(&world, "member-a", "member password").await.cookie().unwrap();
  let second = sign_in(&world, "member-a", "member password").await.cookie().unwrap();
  let third = sign_in(&world, "member-a", "member password").await.cookie().unwrap();
  let id = |cookie: &str| cookie.split_once('=').unwrap().1.to_owned();
  let mut headers = by(world.member);

  headers.push(("session-id", id(&first)));

  let listed =
    ask(&world.app, Method::GET, &format!("/users/{}/devices", world.member), None, &headers).await;
  let devices = listed.body["devices"].as_array().unwrap().clone();

  assert_eq!(devices.len(), 3, "{}", listed.body);
  assert_eq!(devices.iter().filter(|one| one["current"] == json!(true)).count(), 1);

  let other = devices.iter().find(|one| one["current"] == json!(false)).unwrap()["id"]
    .as_i64()
    .unwrap();
  let ended = ask(
    &world.app,
    Method::DELETE,
    &format!("/users/{}/devices/{other}", world.member),
    None,
    &headers,
  )
  .await;

  assert_eq!(ended.status, StatusCode::NO_CONTENT, "{}", ended.body);
  assert_eq!(
    [live(&world.app, &second).await, live(&world.app, &third).await]
      .iter()
      .filter(|live| **live)
      .count(),
    1
  );

  let renewed = ask(
    &world.app,
    Method::POST,
    &format!("/users/{}/devices/others", world.member),
    None,
    &headers,
  )
  .await;

  assert_eq!(renewed.status, StatusCode::OK, "{}", renewed.body);

  let fresh = renewed.cookie().expect("a fresh session");

  assert!(live(&world.app, &fresh).await);
  assert!(!live(&world.app, &first).await);
  assert!(!live(&world.app, &second).await);
  assert!(!live(&world.app, &third).await);
}

#[tokio::test]
async fn an_account_is_disabled_and_enabled_by_the_administrator_alone_and_never_his_own() {
  let world = world().await;
  let path = format!("/users/{}/enabled", world.member);
  let session = sign_in(&world, "member-a", "member password").await.cookie().unwrap();

  let own = ask(
    &world.app,
    Method::PUT,
    &format!("/users/{}/enabled", world.boss),
    Some(json!({ "enabled": false })),
    &by(world.boss),
  )
  .await;

  assert_eq!(own.body["code"], json!("own-account"));

  let refused =
    ask(&world.app, Method::PUT, &path, Some(json!({ "enabled": false })), &by(world.member)).await;

  assert_eq!(refused.status, StatusCode::FORBIDDEN);

  let disabled =
    ask(&world.app, Method::PUT, &path, Some(json!({ "enabled": false })), &by(world.boss)).await;

  assert_eq!(disabled.status, StatusCode::NO_CONTENT, "{}", disabled.body);
  assert!(!live(&world.app, &session).await);
  assert_eq!(
    sign_in(&world, "member-a", "member password").await.body["code"],
    json!("account-disabled")
  );

  let read = ask(
    &world.app,
    Method::GET,
    &format!("/users/{}/security", world.member),
    None,
    &by(world.boss),
  )
  .await;

  assert_eq!(read.body["enabled"], json!(false), "{}", read.body);

  ask(&world.app, Method::PUT, &path, Some(json!({ "enabled": true })), &by(world.boss)).await;

  assert_eq!(sign_in(&world, "member-a", "member password").await.status, StatusCode::OK);
  assert_eq!(
    world
      .scratch
      .count(
        r#"SELECT count(*) FROM "org_history" WHERE "change" IN ('disabled', 'enabled')"#,
        vec![]
      )
      .await,
    2
  );
}
