//! The schema's starting point (docs/accounts.md, 「The tables」): a blank database gets the baseline whole, with
//! the rows it starts with; an install holding the record of the last release before 1.0.0 is taken as it stands;
//! one holding part of it is refused; and the baseline's way down leaves the database blank.

use crate::support::Blank;

use bmo_web_server::migration::{BASELINE, BEFORE, MIGRATIONS_TABLE, Migrator, up};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use sea_orm_migration::MigratorTrait;

const SCHEMA: &str = include_str!("../src/migration/baseline.sql");

/// A row of the service's own, which an install taken as it stands keeps.
const ROW: &str =
  r#"INSERT INTO "web_users" ("name", "password_hash", "created_at") VALUES ('agent-a', 'hash', 1)"#;

// Every column, index, constraint, function and trigger of the store but the record's, in one line.
fn shape_sql() -> String {
  format!(
    "SELECT COALESCE((SELECT string_agg(table_name || '.' || column_name || ' ' || data_type || ' ' || \
     is_nullable || ' ' || COALESCE(column_default, ''), ', ' ORDER BY table_name, ordinal_position) \
     FROM information_schema.columns WHERE table_schema = current_schema() AND table_name <> '{MIGRATIONS_TABLE}'), '') \
     || ' / ' || COALESCE((SELECT string_agg(indexdef, ', ' ORDER BY indexname) FROM pg_indexes \
     WHERE schemaname = current_schema() AND tablename <> '{MIGRATIONS_TABLE}'), '') \
     || ' / ' || COALESCE((SELECT string_agg(c.conrelid::regclass::text || ' ' || c.conname || ' ' || \
     pg_get_constraintdef(c.oid), ', ' ORDER BY c.conrelid::regclass::text, c.conname) FROM pg_constraint c \
     WHERE c.connamespace = current_schema()::regnamespace AND c.conrelid <> '{MIGRATIONS_TABLE}'::regclass), '') \
     || ' / ' || COALESCE((SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p \
     WHERE p.pronamespace = current_schema()::regnamespace), '') \
     || ' / ' || COALESCE((SELECT string_agg(t.tgrelid::regclass::text || ' ' || t.tgname, ', ' \
     ORDER BY t.tgrelid::regclass::text, t.tgname) FROM pg_trigger t WHERE NOT t.tgisinternal), '') AS shape"
  )
}

async fn texts(db: &DatabaseConnection, sql: &str) -> Vec<String> {
  db.query_all(Statement::from_string(DbBackend::Postgres, sql.to_owned()))
    .await
    .unwrap()
    .iter()
    .map(|row| row.try_get_by_index::<String>(0).unwrap())
    .collect()
}

async fn shape(db: &DatabaseConnection) -> Vec<String> {
  texts(db, &shape_sql()).await
}

async fn recorded(db: &DatabaseConnection) -> Vec<String> {
  texts(db, &format!(r#"SELECT "version" FROM "{MIGRATIONS_TABLE}" ORDER BY "version""#)).await
}

// The record table, as the migrator makes it, standing where a laid schema has none.
async fn record_table(db: &DatabaseConnection) {
  db.execute_unprepared(&format!(
    r#"CREATE TABLE IF NOT EXISTS "{MIGRATIONS_TABLE}" ("version" varchar PRIMARY KEY, "applied_at" bigint NOT NULL)"#
  ))
  .await
  .unwrap();
}

// A blank database holding the baseline's schema and a row, recorded as an install from before 1.0.0 that ran
// the first `through` migrations of its last release.
async fn installed(blank: &Blank, through: usize) {
  blank.db.execute_unprepared(SCHEMA).await.unwrap();
  record_table(&blank.db).await;
  for version in &BEFORE[..through] {
    blank
      .db
      .execute_unprepared(&format!(
        r#"INSERT INTO "{MIGRATIONS_TABLE}" ("version", "applied_at") VALUES ('{version}', 1)"#
      ))
      .await
      .unwrap();
  }
  blank.db.execute_unprepared(ROW).await.unwrap();
}

#[tokio::test]
async fn a_blank_database_gets_the_baseline_whole_with_the_rows_it_starts_with() {
  let migrated = Blank::new().await;
  let laid = Blank::new().await;

  up(&migrated.db).await.unwrap();
  laid.db.execute_unprepared(SCHEMA).await.unwrap();
  record_table(&laid.db).await;

  assert_eq!(shape(&migrated.db).await, shape(&laid.db).await);
  assert_eq!(recorded(&migrated.db).await, [BASELINE]);

  let counted = |table: &str| format!(r#"SELECT COUNT(*)::text FROM "{table}""#);

  for (table, rows) in [
    ("relation_definitions", "5"),
    ("mail_forms", "4"),
    ("supply_settings", "1"),
    ("chain_links", "1"),
  ] {
    assert_eq!(texts(&migrated.db, &counted(table)).await, [rows], "{table}");
  }
  assert_eq!(
    texts(&migrated.db, r#"SELECT "key" FROM "secret_kinds" ORDER BY "position""#).await,
    [
      "api-key",
      "account-login",
      "aws-access-key",
      "oauth-client",
      "database",
      "ssh-private-key",
      "file",
      "card",
      "delivery-address"
    ]
  );
}

#[tokio::test]
async fn an_install_at_the_last_release_before_the_baseline_only_has_its_record_rewritten() {
  let blank = Blank::new().await;

  installed(&blank, BEFORE.len()).await;

  let before = shape(&blank.db).await;

  up(&blank.db).await.unwrap();
  assert_eq!(recorded(&blank.db).await, [BASELINE]);
  assert_eq!(shape(&blank.db).await, before);
  assert_eq!(texts(&blank.db, r#"SELECT COUNT(*)::text FROM "web_users""#).await, ["1"]);
  assert_eq!(texts(&blank.db, r#"SELECT COUNT(*)::text FROM "secret_kinds""#).await, ["0"]);

  // A second start finds the baseline recorded and changes nothing.
  up(&blank.db).await.unwrap();
  assert_eq!(recorded(&blank.db).await, [BASELINE]);
  assert_eq!(shape(&blank.db).await, before);
}

#[tokio::test]
async fn an_install_short_of_the_last_release_before_the_baseline_is_refused() {
  let blank = Blank::new().await;

  installed(&blank, 3).await;

  let refused = up(&blank.db).await.unwrap_err().to_string();

  assert!(refused.contains(BEFORE[2]), "{refused}");
  assert_eq!(recorded(&blank.db).await.len(), 3);
}

#[tokio::test]
async fn the_baseline_taken_down_leaves_the_database_blank() {
  let migrated = Blank::new().await;
  let blank = Blank::new().await;

  up(&migrated.db).await.unwrap();
  Migrator::down(&migrated.db, None).await.unwrap();
  record_table(&blank.db).await;

  assert_eq!(shape(&migrated.db).await, shape(&blank.db).await);
  assert!(recorded(&migrated.db).await.is_empty());
  assert_eq!(
    texts(&migrated.db, "SELECT COUNT(*)::text FROM pg_extension WHERE extname = 'uuid-ossp'").await,
    ["0"]
  );
}
