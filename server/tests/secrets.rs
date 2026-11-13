//! The secret store (docs/accounts.md, 「The secret store」; docs/boundary.md, 「The secret store」) on a temporary
//! folder standing in for the data root's `env/`: the modes a write leaves, the value kept before, the names
//! refused, a base64 value written as its bytes, and that no answer and no refusal carries a value; each person's
//! space apart from the administrator's; the store by itself, and its routes as a caller asks them, with the user
//! the console hands on.

use crate::support;

use std::fs;
use std::os::unix::fs::{PermissionsExt, symlink};
use std::path::Path;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::secrets::{self, Space, Store, Written, named};
use bmo_web_server::users::user_for_sender;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use support::{OWNER, ROOM, Scratch, console_hash};
use tower::ServiceExt;

const VALUE: &str = "the value itself, never answered";
const OTHER_VALUE: &str = "the next value, never answered either";
/// The sender a member's user is made for.
const MEMBER: i64 = 777;

fn mode(path: &Path) -> u32 {
  fs::metadata(path).unwrap().permissions().mode() & 0o777
}

fn folder() -> (tempfile::TempDir, std::path::PathBuf) {
  let root = tempfile::tempdir().unwrap();
  let env = root.path().join("env");

  (root, env)
}

#[test]
fn a_value_is_written_with_mode_600_into_a_folder_made_with_mode_700_and_listed_by_its_name_alone() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  assert_eq!(store.list(Space::Administrator).unwrap(), vec![]);

  let (kept, written) =
    store.put(Space::Administrator, "openrouter.token", VALUE.as_bytes(), false).unwrap();

  assert_eq!(written, Written::Made);
  assert_eq!(kept.name, "openrouter.token");
  assert_eq!(kept.bytes, VALUE.len() as i64);
  assert!(kept.changed_at > 0);
  assert_eq!(mode(&env), 0o700);
  assert_eq!(mode(&env.join("openrouter.token")), 0o600);
  assert_eq!(fs::read_to_string(env.join("openrouter.token")).unwrap(), VALUE);
  assert_eq!(store.list(Space::Administrator).unwrap(), vec![kept]);
  // Nothing is left beside it but the file itself.
  assert_eq!(fs::read_dir(&env).unwrap().count(), 1);
}

#[test]
fn a_name_that_stands_is_replaced_only_where_asked_and_its_value_is_kept_before() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  store.put(Space::Administrator, "mail.token", VALUE.as_bytes(), false).unwrap();

  let refused = store
    .put(Space::Administrator, "mail.token", OTHER_VALUE.as_bytes(), false)
    .unwrap_err();

  assert_eq!(refused.status, StatusCode::CONFLICT);
  assert_eq!(refused.code, "secret-exists");
  assert_eq!(fs::read_to_string(env.join("mail.token")).unwrap(), VALUE);

  let (kept, written) =
    store.put(Space::Administrator, "mail.token", OTHER_VALUE.as_bytes(), true).unwrap();

  assert_eq!(written, Written::Replaced);
  assert_eq!(kept.bytes, OTHER_VALUE.len() as i64);
  assert_eq!(fs::read_to_string(env.join("mail.token")).unwrap(), OTHER_VALUE);
  assert_eq!(fs::read_to_string(env.join("mail.token.previous")).unwrap(), VALUE);
  assert_eq!(mode(&env.join("mail.token")), 0o600);
  assert_eq!(mode(&env.join("mail.token.previous")), 0o600);
  // The value kept before is no secret of the list's.
  assert_eq!(
    store
      .list(Space::Administrator)
      .unwrap()
      .iter()
      .map(|one| one.name.as_str())
      .collect::<Vec<_>>(),
    ["mail.token"]
  );
}

#[test]
fn a_delete_moves_the_file_aside_and_a_name_that_stands_nowhere_is_not_found() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  store.put(Space::Administrator, "drive.token", VALUE.as_bytes(), false).unwrap();
  store.remove(Space::Administrator, "drive.token").unwrap();

  assert!(!env.join("drive.token").exists());
  assert_eq!(fs::read_to_string(env.join("drive.token.previous")).unwrap(), VALUE);
  assert_eq!(mode(&env.join("drive.token.previous")), 0o600);
  assert_eq!(store.list(Space::Administrator).unwrap(), vec![]);

  let refused = store.remove(Space::Administrator, "drive.token").unwrap_err();

  assert_eq!(refused.status, StatusCode::NOT_FOUND);
  assert_eq!(refused.code, "not-found");
}

#[test]
fn a_name_other_than_a_plain_file_name_is_refused_without_repeating_it() {
  for name in [
    "",
    ".hidden",
    "..",
    "a/b",
    "../web.toml",
    "with space",
    "a.previous",
    "caf\u{e9}",
    &"x".repeat(201),
  ] {
    let refused = named(name).unwrap_err();

    assert_eq!(refused.status, StatusCode::BAD_REQUEST, "{name}");
    assert_eq!(refused.code, "bad-name", "{name}");
    assert!(name.is_empty() || !refused.detail.contains(name), "{name}: {}", refused.detail);
  }

  for name in ["web.toml", "OPENROUTER_API_KEY", "a-b_c.d", &"x".repeat(200)] {
    named(name).unwrap();
  }
}

#[test]
fn a_name_standing_as_a_folder_or_a_link_is_no_secret_and_is_neither_listed_nor_written() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  fs::create_dir_all(env.join("a-folder")).unwrap();
  fs::create_dir_all(env.join("kept.previous")).unwrap();
  fs::write(env.join("target"), VALUE).unwrap();
  symlink(env.join("target"), env.join("a-link")).unwrap();
  fs::write(env.join(".hidden"), VALUE).unwrap();

  for name in ["a-folder", "a-link", "kept"] {
    let refused = store.put(Space::Administrator, name, OTHER_VALUE.as_bytes(), true).unwrap_err();

    assert_eq!(refused.status, StatusCode::CONFLICT, "{name}");
    assert_eq!(refused.code, "not-a-file", "{name}");
  }

  assert_eq!(fs::read_to_string(env.join("target")).unwrap(), VALUE);
  assert_eq!(store.remove(Space::Administrator, "a-link").unwrap_err().code, "not-a-file");
  assert_eq!(
    store
      .list(Space::Administrator)
      .unwrap()
      .iter()
      .map(|one| one.name.as_str())
      .collect::<Vec<_>>(),
    ["target"]
  );
}

#[test]
fn an_empty_value_is_refused() {
  let (_root, env) = folder();
  let refused = Store::at(&env).put(Space::Administrator, "empty", b"", false).unwrap_err();

  assert_eq!(refused.status, StatusCode::BAD_REQUEST);
  assert_eq!(refused.code, "empty-value");
  assert!(!env.exists());
}

#[test]
fn a_person_s_space_stands_in_a_folder_of_their_own_under_the_people_s_and_lists_apart() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  store.put(Space::Administrator, "deployment.token", VALUE.as_bytes(), false).unwrap();
  store.put(Space::Person(7), "own.token", OTHER_VALUE.as_bytes(), false).unwrap();

  let space = env.join("users").join("7");

  assert_eq!(fs::read_to_string(space.join("own.token")).unwrap(), OTHER_VALUE);
  assert_eq!(mode(&env.join("users")), 0o700);
  assert_eq!(mode(&space), 0o700);
  assert_eq!(mode(&space.join("own.token")), 0o600);
  assert_eq!(
    store
      .list(Space::Administrator)
      .unwrap()
      .iter()
      .map(|one| one.name.as_str())
      .collect::<Vec<_>>(),
    ["deployment.token"]
  );
  assert_eq!(
    store
      .list(Space::Person(7))
      .unwrap()
      .iter()
      .map(|one| one.name.as_str())
      .collect::<Vec<_>>(),
    ["own.token"]
  );
  assert_eq!(store.list(Space::Person(8)).unwrap(), vec![]);

  let refused = store.put(Space::Administrator, "users", VALUE.as_bytes(), true).unwrap_err();

  assert_eq!(refused.code, "bad-name");
  assert!(store.put(Space::Person(7), "users", VALUE.as_bytes(), false).is_ok());
}

/// A request with the token and, where one is given, the user the console hands on, and the status and the body's
/// text it is answered with.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<String>,
  key: Option<i32>,
) -> (StatusCode, String) {
  let mut request = Request::builder().method(method).uri(path).header("x-real-ip", "127.0.0.1");

  if let Some(key) = key {
    request = request.header("owner-key", key.to_string());
  }

  let request = match body {
    Some(body) => request.header(header::CONTENT_TYPE, "application/json").body(Body::from(body)).unwrap(),
    None => request.body(Body::empty()).unwrap(),
  };
  let answer = app.clone().oneshot(request).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();

  (status, String::from_utf8(bytes.to_vec()).unwrap())
}

fn read(text: &str) -> Value {
  serde_json::from_str(text).unwrap()
}

/// A database the move has run on, with the console's one account, the platform administrator, and a member
/// linked to a sender.
async fn moved() -> (Scratch, i32, i32) {
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;

  let moved = run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![ROOM],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();
  let boss = moved.administrator.expect("the move names the platform administrator");
  let member = user_for_sender(scratch.db(), MEMBER).await.unwrap();

  (scratch, boss, member)
}

/// The store's routes as the server mounts them, on a database the move has run on, the store on `env`, with the
/// administrator's user and a member's. The token and the model's gate in front of them are the server's own,
/// held by the routes' tests.
async fn app(env: &Path) -> (Scratch, Router, i32, i32) {
  let (scratch, boss, member) = moved().await;
  let app = secrets::routes().with_state(scratch.service.clone().keeping_secrets(Store::at(env)));

  (scratch, app, boss, member)
}

#[tokio::test]
async fn the_routes_write_list_and_delete_and_no_answer_carries_a_value() {
  let (_root, env) = folder();
  let (_scratch, app, boss, _) = app(&env).await;
  let ask = json!({ "value": VALUE }).to_string();
  let named = format!("/users/{boss}/secrets/agent-a.token");

  let (status, made) = asked(&app, Method::PUT, &named, Some(ask.clone()), Some(boss)).await;

  assert_eq!(status, StatusCode::CREATED, "{made}");
  assert!(!made.contains(VALUE));

  let made = read(&made);
  let keys: Vec<&String> = made.as_object().unwrap().keys().collect();

  assert_eq!(keys, ["bytes", "changedAt", "name"]);
  assert_eq!(made["name"], "agent-a.token");
  assert_eq!(made["bytes"], VALUE.len());
  assert_eq!(mode(&env.join("agent-a.token")), 0o600);

  let (status, again) = asked(&app, Method::PUT, &named, Some(ask), Some(boss)).await;

  assert_eq!(status, StatusCode::CONFLICT);
  assert_eq!(read(&again)["code"], "secret-exists");
  assert!(!again.contains(VALUE));

  let replace = json!({ "value": OTHER_VALUE, "replace": true }).to_string();
  let (status, replaced) = asked(&app, Method::PUT, &named, Some(replace), Some(boss)).await;

  assert_eq!(status, StatusCode::OK, "{replaced}");
  assert!(!replaced.contains(OTHER_VALUE));
  assert_eq!(read(&replaced)["bytes"], OTHER_VALUE.len());

  let (status, listed) =
    asked(&app, Method::GET, &format!("/users/{boss}/secrets"), None, Some(boss)).await;

  assert_eq!(status, StatusCode::OK);
  assert!(!listed.contains(VALUE) && !listed.contains(OTHER_VALUE));
  assert_eq!(
    read(&listed),
    json!({ "secrets": [{ "name": "agent-a.token", "bytes": OTHER_VALUE.len(), "changedAt": read(&replaced)["changedAt"] }] })
  );

  let (status, _) = asked(&app, Method::DELETE, &named, None, Some(boss)).await;

  assert_eq!(status, StatusCode::NO_CONTENT);
  assert_eq!(fs::read_to_string(env.join("agent-a.token.previous")).unwrap(), OTHER_VALUE);

  let (status, gone) = asked(&app, Method::DELETE, &named, None, Some(boss)).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(read(&gone)["code"], "not-found");
}

#[tokio::test]
async fn a_member_writes_into_their_own_space_and_neither_lists_the_other_s() {
  let (_root, env) = folder();
  let (_scratch, app, boss, member) = app(&env).await;
  let ask = json!({ "value": VALUE }).to_string();
  let (status, made) = asked(
    &app,
    Method::PUT,
    &format!("/users/{member}/secrets/own.token"),
    Some(ask),
    Some(member),
  )
  .await;

  assert_eq!(status, StatusCode::CREATED, "{made}");
  assert_eq!(
    fs::read_to_string(env.join("users").join(member.to_string()).join("own.token")).unwrap(),
    VALUE
  );
  assert!(!env.join("own.token").exists());

  let (_, theirs) = asked(&app, Method::GET, &format!("/users/{member}/secrets"), None, Some(member)).await;
  let (_, deployment) = asked(&app, Method::GET, &format!("/users/{boss}/secrets"), None, Some(boss)).await;

  assert_eq!(read(&theirs)["secrets"][0]["name"], "own.token");
  assert_eq!(read(&deployment), json!({ "secrets": [] }));
}

#[tokio::test]
async fn a_key_other_than_the_space_s_user_is_refused_before_anything_is_read_or_written() {
  let (_root, env) = folder();
  let (_scratch, app, boss, member) = app(&env).await;
  let ask = json!({ "value": VALUE }).to_string();

  // The administrator into a member's space, a member into the administrator's, and a call naming nobody.
  for (space, key) in [(member, Some(boss)), (boss, Some(member)), (boss, None)] {
    for (method, path, body) in [
      (Method::GET, format!("/users/{space}/secrets"), None),
      (Method::PUT, format!("/users/{space}/secrets/agent-a.token"), Some(ask.clone())),
      (Method::DELETE, format!("/users/{space}/secrets/agent-a.token"), None),
    ] {
      let (status, said) = asked(&app, method.clone(), &path, body, key).await;

      assert_eq!(status, StatusCode::FORBIDDEN, "{method} {path} as {key:?}");
      assert_eq!(read(&said)["code"], "forbidden");
    }
  }

  let (status, _) = asked(&app, Method::GET, "/users/987654/secrets", None, Some(987_654)).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert!(!env.exists());
}

#[tokio::test]
async fn a_body_or_a_name_that_does_not_read_is_refused_without_repeating_what_was_sent() {
  let (_root, env) = folder();
  let (_scratch, app, boss, _) = app(&env).await;
  let named = format!("/users/{boss}/secrets/agent-a.token");

  for body in [
    json!({ "value": 9_876_543_210_u64 }).to_string(),
    json!({ "value": [VALUE] }).to_string(),
    json!({ "secret": VALUE }).to_string(),
    format!("{{\"value\": \"{VALUE}"),
  ] {
    let (status, said) = asked(&app, Method::PUT, &named, Some(body), Some(boss)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");
    assert_eq!(read(&said)["code"], "bad-request");
    assert!(!said.contains(VALUE) && !said.contains("9876543210"), "{said}");
  }

  let ask = json!({ "value": VALUE }).to_string();

  for name in [".hidden", "a.previous", "a%2Fb", "..%2Fweb.toml", "users"] {
    let path = format!("/users/{boss}/secrets/{name}");
    let (status, said) = asked(&app, Method::PUT, &path, Some(ask.clone()), Some(boss)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "{path}: {said}");
    assert_eq!(read(&said)["code"], "bad-name");
  }

  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/users/{boss}/secrets/empty"),
    Some(json!({ "value": "" }).to_string()),
    Some(boss),
  )
  .await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(read(&said)["code"], "empty-value");
  assert!(!env.exists());
}

#[tokio::test]
async fn a_base64_value_is_written_as_the_bytes_it_decodes_to_and_one_that_does_not_decode_is_refused() {
  let (_root, env) = folder();
  let (_scratch, app, boss, _) = app(&env).await;
  // Bytes no UTF-8 text holds, as a key file or an archive carries them.
  let bytes = [0x00, 0xff, 0xfe, 0x80, b'\n', 0xc3];
  let ask = json!({ "value": STANDARD.encode(bytes), "encoding": "base64" }).to_string();
  let (status, made) =
    asked(&app, Method::PUT, &format!("/users/{boss}/secrets/agent-a.key"), Some(ask), Some(boss)).await;

  assert_eq!(status, StatusCode::CREATED, "{made}");
  assert_eq!(read(&made)["bytes"], bytes.len());
  assert_eq!(fs::read(env.join("agent-a.key")).unwrap(), bytes);

  let undecodable = "not base64, and never answered!";
  let ask = json!({ "value": undecodable, "encoding": "base64" }).to_string();
  let (status, said) =
    asked(&app, Method::PUT, &format!("/users/{boss}/secrets/agent-b.key"), Some(ask), Some(boss)).await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(read(&said)["code"], "bad-value");
  assert!(!said.contains(undecodable), "{said}");
  assert!(!env.join("agent-b.key").exists());
}

#[tokio::test]
async fn a_server_whose_settings_name_no_folder_says_so() {
  let (scratch, boss, _) = moved().await;
  let app = secrets::routes().with_state(scratch.service.clone());
  let (status, said) = asked(&app, Method::GET, &format!("/users/{boss}/secrets"), None, Some(boss)).await;

  assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
  assert_eq!(read(&said)["code"], "no-secret-store");
}
