//! The secret store (docs/accounts.md, 「The secret store」; docs/boundary.md, 「The secret store」) on a temporary
//! folder standing in for the data root's `env/`: the modes a write leaves, the value kept before, the names
//! refused, a base64 value written as its bytes, and that no answer and no refusal carries a value — the store by itself, and its routes as a caller
//! asks them, with the role the console hands on.

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
use bmo_web_server::secrets::{self, Store, Written, named};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use support::{OWNER, ROOM, Scratch, console_hash};
use tower::ServiceExt;

const VALUE: &str = "the value itself, never answered";
const OTHER_VALUE: &str = "the next value, never answered either";

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

  assert_eq!(store.list().unwrap(), vec![]);

  let (kept, written) = store.put("openrouter.token", VALUE.as_bytes(), false).unwrap();

  assert_eq!(written, Written::Made);
  assert_eq!(kept.name, "openrouter.token");
  assert_eq!(kept.bytes, VALUE.len() as i64);
  assert!(kept.changed_at > 0);
  assert_eq!(mode(&env), 0o700);
  assert_eq!(mode(&env.join("openrouter.token")), 0o600);
  assert_eq!(fs::read_to_string(env.join("openrouter.token")).unwrap(), VALUE);
  assert_eq!(store.list().unwrap(), vec![kept]);
  // Nothing is left beside it but the file itself.
  assert_eq!(fs::read_dir(&env).unwrap().count(), 1);
}

#[test]
fn a_name_that_stands_is_replaced_only_where_asked_and_its_value_is_kept_before() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  store.put("mail.token", VALUE.as_bytes(), false).unwrap();

  let refused = store.put("mail.token", OTHER_VALUE.as_bytes(), false).unwrap_err();

  assert_eq!(refused.status, StatusCode::CONFLICT);
  assert_eq!(refused.code, "secret-exists");
  assert_eq!(fs::read_to_string(env.join("mail.token")).unwrap(), VALUE);

  let (kept, written) = store.put("mail.token", OTHER_VALUE.as_bytes(), true).unwrap();

  assert_eq!(written, Written::Replaced);
  assert_eq!(kept.bytes, OTHER_VALUE.len() as i64);
  assert_eq!(fs::read_to_string(env.join("mail.token")).unwrap(), OTHER_VALUE);
  assert_eq!(fs::read_to_string(env.join("mail.token.previous")).unwrap(), VALUE);
  assert_eq!(mode(&env.join("mail.token")), 0o600);
  assert_eq!(mode(&env.join("mail.token.previous")), 0o600);
  // The value kept before is no secret of the list's.
  assert_eq!(
    store.list().unwrap().iter().map(|one| one.name.as_str()).collect::<Vec<_>>(),
    ["mail.token"]
  );
}

#[test]
fn a_delete_moves_the_file_aside_and_a_name_that_stands_nowhere_is_not_found() {
  let (_root, env) = folder();
  let store = Store::at(&env);

  store.put("drive.token", VALUE.as_bytes(), false).unwrap();
  store.remove("drive.token").unwrap();

  assert!(!env.join("drive.token").exists());
  assert_eq!(fs::read_to_string(env.join("drive.token.previous")).unwrap(), VALUE);
  assert_eq!(mode(&env.join("drive.token.previous")), 0o600);
  assert_eq!(store.list().unwrap(), vec![]);

  let refused = store.remove("drive.token").unwrap_err();

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
    let refused = store.put(name, OTHER_VALUE.as_bytes(), true).unwrap_err();

    assert_eq!(refused.status, StatusCode::CONFLICT, "{name}");
    assert_eq!(refused.code, "not-a-file", "{name}");
  }

  assert_eq!(fs::read_to_string(env.join("target")).unwrap(), VALUE);
  assert_eq!(store.remove("a-link").unwrap_err().code, "not-a-file");
  assert_eq!(
    store.list().unwrap().iter().map(|one| one.name.as_str()).collect::<Vec<_>>(),
    ["target"]
  );
}

#[test]
fn an_empty_value_is_refused() {
  let (_root, env) = folder();
  let refused = Store::at(&env).put("empty", b"", false).unwrap_err();

  assert_eq!(refused.status, StatusCode::BAD_REQUEST);
  assert_eq!(refused.code, "empty-value");
  assert!(!env.exists());
}

/// A request with the token and, where one is given, the role, and the status and the body's text it is answered
/// with.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<String>,
  role: Option<&str>,
) -> (StatusCode, String) {
  let mut request = Request::builder().method(method).uri(path).header("x-real-ip", "127.0.0.1");

  if let Some(role) = role {
    request = request.header("owner-role", role);
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

/// A database the move has run on, with the console's one account.
async fn moved() -> Scratch {
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

/// The store's routes as the server mounts them, on a database the move has run on, the store on `env`. The
/// token and the model's gate in front of them are the server's own, held by the routes' tests.
async fn app(env: &Path) -> (Scratch, Router) {
  let scratch = moved().await;
  let app = secrets::routes().with_state(scratch.service.clone().keeping_secrets(Store::at(env)));

  (scratch, app)
}

#[tokio::test]
async fn the_routes_write_list_and_delete_and_no_answer_carries_a_value() {
  let (_root, env) = folder();
  let (_scratch, app) = app(&env).await;
  let ask = json!({ "value": VALUE }).to_string();

  let (status, made) =
    asked(&app, Method::PUT, "/secrets/agent-a.token", Some(ask.clone()), Some("administrator")).await;

  assert_eq!(status, StatusCode::CREATED, "{made}");
  assert!(!made.contains(VALUE));

  let made = read(&made);
  let keys: Vec<&String> = made.as_object().unwrap().keys().collect();

  assert_eq!(keys, ["bytes", "changedAt", "name"]);
  assert_eq!(made["name"], "agent-a.token");
  assert_eq!(made["bytes"], VALUE.len());
  assert_eq!(mode(&env.join("agent-a.token")), 0o600);

  let (status, again) =
    asked(&app, Method::PUT, "/secrets/agent-a.token", Some(ask), Some("administrator")).await;

  assert_eq!(status, StatusCode::CONFLICT);
  assert_eq!(read(&again)["code"], "secret-exists");
  assert!(!again.contains(VALUE));

  let replace = json!({ "value": OTHER_VALUE, "replace": true }).to_string();
  let (status, replaced) =
    asked(&app, Method::PUT, "/secrets/agent-a.token", Some(replace), Some("administrator")).await;

  assert_eq!(status, StatusCode::OK, "{replaced}");
  assert!(!replaced.contains(OTHER_VALUE));
  assert_eq!(read(&replaced)["bytes"], OTHER_VALUE.len());

  let (status, listed) = asked(&app, Method::GET, "/secrets", None, Some("administrator")).await;

  assert_eq!(status, StatusCode::OK);
  assert!(!listed.contains(VALUE) && !listed.contains(OTHER_VALUE));
  assert_eq!(
    read(&listed),
    json!({ "secrets": [{ "name": "agent-a.token", "bytes": OTHER_VALUE.len(), "changedAt": read(&replaced)["changedAt"] }] })
  );

  let (status, _) =
    asked(&app, Method::DELETE, "/secrets/agent-a.token", None, Some("administrator")).await;

  assert_eq!(status, StatusCode::NO_CONTENT);
  assert_eq!(fs::read_to_string(env.join("agent-a.token.previous")).unwrap(), OTHER_VALUE);

  let (status, gone) =
    asked(&app, Method::DELETE, "/secrets/agent-a.token", None, Some("administrator")).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(read(&gone)["code"], "not-found");
}

#[tokio::test]
async fn a_role_other_than_the_administrator_is_refused_before_anything_is_read_or_written() {
  let (_root, env) = folder();
  let (_scratch, app) = app(&env).await;
  let ask = json!({ "value": VALUE }).to_string();

  for role in [None, Some("member"), Some("Administrator")] {
    for (method, path, body) in [
      (Method::GET, "/secrets", None),
      (Method::PUT, "/secrets/agent-a.token", Some(ask.clone())),
      (Method::DELETE, "/secrets/agent-a.token", None),
    ] {
      let (status, said) = asked(&app, method.clone(), path, body, role).await;

      assert_eq!(status, StatusCode::FORBIDDEN, "{method} {path} as {role:?}");
      assert_eq!(read(&said)["code"], "forbidden");
    }
  }

  assert!(!env.exists());
}

#[tokio::test]
async fn a_body_or_a_name_that_does_not_read_is_refused_without_repeating_what_was_sent() {
  let (_root, env) = folder();
  let (_scratch, app) = app(&env).await;

  for body in [
    json!({ "value": 9_876_543_210_u64 }).to_string(),
    json!({ "value": [VALUE] }).to_string(),
    json!({ "secret": VALUE }).to_string(),
    format!("{{\"value\": \"{VALUE}"),
  ] {
    let (status, said) =
      asked(&app, Method::PUT, "/secrets/agent-a.token", Some(body), Some("administrator")).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");
    assert_eq!(read(&said)["code"], "bad-request");
    assert!(!said.contains(VALUE) && !said.contains("9876543210"), "{said}");
  }

  let ask = json!({ "value": VALUE }).to_string();

  for path in ["/secrets/.hidden", "/secrets/a.previous", "/secrets/a%2Fb", "/secrets/..%2Fweb.toml"] {
    let (status, said) = asked(&app, Method::PUT, path, Some(ask.clone()), Some("administrator")).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "{path}: {said}");
    assert_eq!(read(&said)["code"], "bad-name");
  }

  let (status, said) = asked(
    &app,
    Method::PUT,
    "/secrets/empty",
    Some(json!({ "value": "" }).to_string()),
    Some("administrator"),
  )
  .await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(read(&said)["code"], "empty-value");
  assert!(!env.exists());
}

#[tokio::test]
async fn a_base64_value_is_written_as_the_bytes_it_decodes_to_and_one_that_does_not_decode_is_refused() {
  let (_root, env) = folder();
  let (_scratch, app) = app(&env).await;
  // Bytes no UTF-8 text holds, as a key file or an archive carries them.
  let bytes = [0x00, 0xff, 0xfe, 0x80, b'\n', 0xc3];
  let ask = json!({ "value": STANDARD.encode(bytes), "encoding": "base64" }).to_string();
  let (status, made) =
    asked(&app, Method::PUT, "/secrets/agent-a.key", Some(ask), Some("administrator")).await;

  assert_eq!(status, StatusCode::CREATED, "{made}");
  assert_eq!(read(&made)["bytes"], bytes.len());
  assert_eq!(fs::read(env.join("agent-a.key")).unwrap(), bytes);

  let undecodable = "not base64, and never answered!";
  let ask = json!({ "value": undecodable, "encoding": "base64" }).to_string();
  let (status, said) =
    asked(&app, Method::PUT, "/secrets/agent-b.key", Some(ask), Some("administrator")).await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(read(&said)["code"], "bad-value");
  assert!(!said.contains(undecodable), "{said}");
  assert!(!env.join("agent-b.key").exists());
}

#[tokio::test]
async fn a_server_whose_settings_name_no_folder_says_so() {
  let scratch = moved().await;
  let app = secrets::routes().with_state(scratch.service.clone());
  let (status, said) = asked(&app, Method::GET, "/secrets", None, Some("administrator")).await;

  assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
  assert_eq!(read(&said)["code"], "no-secret-store");
}
