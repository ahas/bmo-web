//! The old archive's move into the account service's store (src/import.rs, TODO #1923): the mapping,
//! the refusal of a store already holding rows, and the count-and-sample compare, over a small export
//! written into a temporary folder and a migrated scratch database.

use crate::support;

use std::fs;
use std::path::PathBuf;

use bmo_web_server::import::{self, Cell};
use serde_json::{Value, json};
use support::Scratch;

/// A small export in the shape the item's export hand writes: every table the import knows, with the
/// rows given and none elsewhere.
fn fixture() -> (tempfile::TempDir, PathBuf) {
  let dir = tempfile::tempdir().expect("a temporary folder");
  let rows: Vec<(&str, Vec<Value>, Vec<&str>)> = vec![
    (
      "organizations",
      vec![
        json!({"id": 1, "name": "bmo", "parent_id": null, "created_at": "2026-10-07T04:39:29.751574+09:00", "updated_at": "2026-10-07T04:39:29.751574+09:00"}),
      ],
      vec!["id"],
    ),
    (
      "roles",
      vec![
        json!({"id": 1, "name": "everyone", "description": null, "created_at": "2026-10-07T04:39:29.751574+09:00", "updated_at": "2026-10-07T04:39:29.751574+09:00"}),
      ],
      vec!["id"],
    ),
    (
      "users",
      vec![
        json!({"id": 1, "username": "ahas", "password": "$argon2id$v=19$m=65536,t=2,p=1$x$y", "email": null, "full_name": null, "phone": null, "role_id": 1, "organization_id": 1, "is_admin": true, "is_enabled": true, "credentials_reset_at": null, "created_at": "2026-10-07T04:39:29.751574+09:00", "updated_at": "2026-10-07T04:39:29.751574+09:00"}),
      ],
      vec!["id"],
    ),
    (
      "user_senders",
      vec![json!({"sender_id": 90000001, "user_id": 1, "linked_at": 1788426674})],
      vec!["sender_id"],
    ),
    (
      "org_closure",
      vec![json!({"descendant_id": 1, "ancestor_id": 1, "depth": 0})],
      vec!["descendant_id", "ancestor_id"],
    ),
    (
      "relation_tuples",
      vec![
        json!({"id": 1, "resource_type": "bmo_worker", "resource_id": "worker-a", "relation": "run", "subject_type": "user", "subject_id": "1", "subject_relation": "", "subject_key": "user:1", "resource_id_int": 90000001, "expires_at": null, "created_at": "2026-10-07T04:39:29.751574+09:00", "created_by": "data-move"}),
      ],
      vec!["id"],
    ),
    (
      "web_users",
      vec![
        json!({"name": "ahas", "password_hash": "$argon2id$v=19$m=65536,t=2,p=1$x$y", "created_at": 1788426674}),
      ],
      vec!["name"],
    ),
    (
      "settings",
      vec![
        json!({"key": "users_administrator", "value": "1", "rowid": 1}),
        json!({"key": "users_moved_at", "value": "1791315569764", "rowid": 2}),
      ],
      vec!["key"],
    ),
  ];

  let mut manifest = Vec::new();
  for table in import::TABLES {
    let (held, key): (Vec<Value>, Vec<&str>) = rows
      .iter()
      .find(|(source, _, _)| *source == table.source)
      .map(|(_, rows, key)| (rows.clone(), key.clone()))
      .unwrap_or_else(|| (Vec::new(), vec![table.columns[0]]));
    let file = format!("{}.ndjson", table.source);
    let mut body = String::new();
    for row in &held {
      body.push_str(&row.to_string());
      body.push('\n');
    }
    fs::write(dir.path().join(&file), body).expect("the export file");
    manifest.push(json!({
      "source": table.source,
      "file": file,
      "count": held.len(),
      "columns": [],
      "key": key
    }));
  }
  fs::write(
    dir.path().join("manifest.json"),
    json!({
      "unit": "web",
      "snapshot": "1:1:",
      "readAt": "2026-10-21 17:00:00+09",
      "readOnly": true,
      "tables": manifest
    })
    .to_string(),
  )
  .expect("the manifest");

  let path = dir.path().to_path_buf();
  (dir, path)
}

#[test]
fn a_row_is_rendered_as_the_text_each_target_column_takes() {
  let table = import::TABLES.iter().find(|table| table.source == "users").expect("users");
  let row = import::row(
    table,
    &json!({"id": 1, "username": "ahas", "password": "hash", "email": null, "full_name": null, "phone": null, "role_id": 1, "organization_id": 1, "is_admin": true, "is_enabled": false, "credentials_reset_at": null, "created_at": "2026-10-07T04:39:29.751574+09:00", "updated_at": "2026-10-07T04:39:29.751574+09:00"}),
  );
  let get = |column: &str| {
    row
      .iter()
      .find(|(held, _)| *held == column)
      .map(|(_, cell)| cell.clone())
      .expect("a mapped column")
  };
  assert_eq!(get("username"), Cell::Text("ahas".to_owned()));
  assert_eq!(get("is_admin"), Cell::Text("true".to_owned()));
  assert_eq!(get("is_enabled"), Cell::Text("false".to_owned()));
  assert_eq!(get("email"), Cell::Null);
}

#[tokio::test]
async fn the_import_writes_its_rows_refuses_a_second_run_and_the_compare_finds_a_changed_row() {
  let (_folder, export) = fixture();
  let scratch = Scratch::new().await;
  let address = scratch.address();

  let report = import::run(&address, &export, false).await.expect("the import");
  assert_eq!(report.snapshot, "1:1:");
  assert!(report.sample.failures.is_empty(), "{:?}", report.sample.failures);

  assert_eq!(scratch.count("SELECT COUNT(*) FROM users", vec![]).await, 1);
  assert_eq!(scratch.count("SELECT COUNT(*) FROM relation_tuples", vec![]).await, 1);
  assert_eq!(scratch.count("SELECT COUNT(*) FROM org_closure", vec![]).await, 1);
  assert_eq!(scratch.count("SELECT COUNT(*) FROM settings", vec![]).await, 2);
  assert!(
    bmo_web_server::data_move::moved(&scratch.service.db).await.expect("the mark reads"),
    "the store the import wrote answers in force"
  );
  assert_eq!(
    scratch
      .count(
        "SELECT COUNT(*) FROM settings WHERE key = 'users_administrator' AND value = '1'",
        vec![]
      )
      .await,
    1
  );

  // A second run is refused for holding rows of the tables the import itself writes — the accounts and
  // their relations, the closure and the settings, and the move's own mark — and never for `mail_forms`,
  // which sumida's mail-form feature seeds and the move no longer owns.
  let again = import::run(&address, &export, false)
    .await
    .expect_err("a store holding rows is refused");
  assert!(again.contains("already holds rows"), "{again}");
  for owned in ["users", "relation_tuples", "org_closure", "settings"] {
    assert!(again.contains(owned), "the refusal names the owned table {owned}: {again}");
  }
  assert!(
    !again.contains("mail_forms"),
    "a seeded mail form is not the move's to refuse over: {again}"
  );

  let passes = import::verify(&address, &export).await.expect("the compare");
  assert!(passes.failures.is_empty(), "{:?}", passes.failures);

  scratch.run("UPDATE users SET username = 'changed' WHERE id = 1", vec![]).await;
  let changed = import::verify(&address, &export).await.expect("the compare");
  assert!(
    changed.failures.iter().any(|failure| failure.contains("username")),
    "{:?}",
    changed.failures
  );
}

#[tokio::test]
async fn a_dry_run_writes_nothing() {
  let (_folder, export) = fixture();
  let scratch = Scratch::new().await;
  let address = scratch.address();

  let report = import::run(&address, &export, true).await.expect("the dry run");
  assert!(report.dry_run);
  assert_eq!(scratch.count("SELECT COUNT(*) FROM users", vec![]).await, 0);
}
