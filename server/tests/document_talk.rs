//! The talk about a document (`docs/documents-viewer.md`, 「The record」; `docs/accounts.md`, 「The tables」):
//! the migrations make `document_talk` as the console writes and reads it, the owner's words with the passage,
//! heading and version they were said over, the chat agent's answer bare, read back by the document's name in
//! the order said; and the last migrations taken down drop their tables.

use crate::support;

use bmo_web_server::migration::Migrator;
use sea_orm::{ConnectionTrait, DbBackend, Statement, Value};
use sea_orm_migration::MigratorTrait;
use support::Scratch;

const SAY: &str = r#"INSERT INTO "document_talk" ("document", "speaker", "text", "said_at", "passage", "heading", "version", "translated")
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#;

// One turn as it reads back: speaker, words, second said, passage, heading, version, translated.
type Turn = (String, String, i64, Option<String>, Option<String>, Option<String>, i64);

const ANSWER: &str =
  r#"INSERT INTO "document_talk" ("document", "speaker", "text", "said_at") VALUES ($1, $2, $3, $4)"#;

#[tokio::test]
async fn a_documents_talk_reads_back_in_the_order_it_was_said() {
  let scratch = Scratch::new().await;
  let none = || Value::String(None);

  scratch
    .run(
      SAY,
      vec![
        "notes/a.md".into(),
        "owner".into(),
        "What does this part mean?".into(),
        100_i64.into(),
        "the selected passage".into(),
        "A heading".into(),
        "abc123".into(),
        1_i64.into(),
      ],
    )
    .await;
  scratch
    .run(
      ANSWER,
      vec!["notes/b.md".into(), "owner".into(), "Another document".into(), 101_i64.into()],
    )
    .await;
  scratch
    .run(ANSWER, vec!["notes/a.md".into(), "bmo".into(), "It means this.".into(), 102_i64.into()])
    .await;
  scratch
    .run(
      SAY,
      vec![
        "notes/a.md".into(),
        "owner".into(),
        "Thanks".into(),
        103_i64.into(),
        none(),
        none(),
        none(),
        0_i64.into(),
      ],
    )
    .await;

  let rows = scratch
    .db()
    .query_all(Statement::from_sql_and_values(
      DbBackend::Postgres,
      r#"SELECT "speaker", "text", "said_at", "passage", "heading", "version", "translated"
        FROM "document_talk" WHERE "document" = $1 ORDER BY "id""#,
      vec!["notes/a.md".into()],
    ))
    .await
    .expect("the talk reads");
  let read: Vec<Turn> = rows
    .iter()
    .map(|row| {
      (
        row.try_get("", "speaker").unwrap(),
        row.try_get("", "text").unwrap(),
        row.try_get("", "said_at").unwrap(),
        row.try_get("", "passage").unwrap(),
        row.try_get("", "heading").unwrap(),
        row.try_get("", "version").unwrap(),
        row.try_get("", "translated").unwrap(),
      )
    })
    .collect();

  assert_eq!(
    read,
    vec![
      (
        "owner".into(),
        "What does this part mean?".into(),
        100,
        Some("the selected passage".into()),
        Some("A heading".into()),
        Some("abc123".into()),
        1
      ),
      ("bmo".into(), "It means this.".into(), 102, None, None, None, 0),
      ("owner".into(), "Thanks".into(), 103, None, None, None, 0),
    ]
  );
  assert_eq!(
    scratch
      .count(
        "SELECT count(*) FROM pg_indexes WHERE tablename = 'document_talk' AND indexname = 'document_talk_document'",
        vec![],
      )
      .await,
    1
  );
}

#[tokio::test]
async fn the_last_migrations_taken_down_drop_their_tables() {
  let scratch = Scratch::new().await;

  Migrator::down(scratch.db(), Some(10)).await.expect("the last migrations go down");

  for table in [
    "document_talk",
    "user_profiles",
    "user_invites",
    "user_nodes",
    "user_departures",
    "secret_kinds",
    "company_agents",
    "own_agents",
    "agent_permissions",
    "user_sign_ins",
  ] {
    let counted = format!("SELECT count(*) FROM pg_tables WHERE tablename = '{table}'");

    assert_eq!(scratch.count(&counted, vec![]).await, 0);
  }
}
