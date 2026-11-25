//! The schema's starting point and what follows it (docs/accounts.md, 「The tables」): a blank database gets the
//! baseline whole and the migrations after it, with the rows it starts with; an install holding the record of the
//! last release before 1.0.0 is taken as it stands; one holding part of it is refused; every migration's way down
//! leaves the database blank; and the room relations' removal takes what room grants held and gives it back empty.

use std::sync::Arc;

use crate::support::{Blank, Leaders, names, ready};

use bmo_web_server::migration::{BASELINE, BEFORE, LATER, MIGRATIONS_TABLE, Migrator, up};
use bmo_web_server::routes::stand;
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

// Every migration's record, in the order the record is read: the baseline's and each later one's.
fn every_migration() -> Vec<String> {
  let mut names: Vec<String> = std::iter::once(BASELINE)
    .chain(LATER.iter().map(|(name, _)| *name))
    .map(str::to_owned)
    .collect();

  names.sort();
  names
}

// The baseline laid by hand and every later migration's way up after it.
async fn laid_whole(db: &DatabaseConnection) {
  db.execute_unprepared(SCHEMA).await.unwrap();
  for (_, sql) in LATER {
    db.execute_unprepared(sql).await.unwrap();
  }
  record_table(db).await;
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
  laid_whole(&laid.db).await;

  assert_eq!(shape(&migrated.db).await, shape(&laid.db).await);
  assert_eq!(recorded(&migrated.db).await, every_migration());

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
async fn an_install_at_the_last_release_before_the_baseline_has_its_record_rewritten_and_runs_what_follows()
{
  let blank = Blank::new().await;
  let migrated = Blank::new().await;

  installed(&blank, BEFORE.len()).await;
  up(&migrated.db).await.unwrap();

  let before = shape(&migrated.db).await;

  up(&blank.db).await.unwrap();
  assert_eq!(recorded(&blank.db).await, every_migration());
  assert_eq!(shape(&blank.db).await, before);
  assert_eq!(texts(&blank.db, r#"SELECT COUNT(*)::text FROM "web_users""#).await, ["1"]);
  assert_eq!(texts(&blank.db, r#"SELECT COUNT(*)::text FROM "secret_kinds""#).await, ["0"]);

  // A second start finds every migration recorded and changes nothing.
  up(&blank.db).await.unwrap();
  assert_eq!(recorded(&blank.db).await, every_migration());
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
async fn every_migration_taken_down_leaves_the_database_blank() {
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

// One count a statement answers, as text.
async fn count(db: &DatabaseConnection, sql: &str) -> String {
  texts(db, &format!("SELECT ({sql})::text")).await.remove(0)
}

#[tokio::test]
async fn the_room_relations_removal_takes_what_room_grants_held_and_its_way_down_gives_it_back_empty() {
  ready();
  let blank = Blank::new().await;
  let baseline = Blank::new().await;

  Migrator::up(&blank.db, Some(1)).await.unwrap();
  baseline.db.execute_unprepared(SCHEMA).await.unwrap();
  record_table(&baseline.db).await;

  // What a release keeping room grants left: the room kind's projection, a grant to a user and one to the room's
  // members with the words beside them, and a section's grant, which stays.
  blank
    .db
    .execute_unprepared(
      r#"INSERT INTO "relation_definitions" ("resource_type", "relation", "kind", "subject_types") VALUES
           ('bmo_room', 'ask', 'stored', '{user,bmo_member}'), ('bmo_room', 'rule', 'stored', '{user}'),
           ('bmo_section', 'read', 'stored', '{user}');
         INSERT INTO "permission_definitions" ("resource_type", "permission", "rewrite") VALUES
           ('bmo_room', 'may_ask', '{}');
         INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation") VALUES
           ('bmo_room', '-100', 'ask', 'user', '1', ''), ('bmo_room', '-100', 'ask', 'bmo_member', '-100', ''),
           ('bmo_room', '-100', 'rule', 'user', '2', ''), ('bmo_section', 'notes', 'read', 'user', '1', '');
         INSERT INTO "grant_words" ("resource_type", "resource_id", "relation", "subject_key", "words", "written_at")
           VALUES ('bmo_room', '-100', 'rule', 'user:2', 'may have their own items approved', 1);"#,
    )
    .await
    .unwrap();

  Migrator::up(&blank.db, Some(1)).await.unwrap();

  let tuples = r#"SELECT COUNT(*) FROM "relation_tuples""#;

  assert_eq!(count(&blank.db, &format!(r#"{tuples} WHERE "resource_type" = 'bmo_room'"#)).await, "0");
  assert_eq!(count(&blank.db, &format!(r#"{tuples} WHERE "subject_type" = 'bmo_member'"#)).await, "0");
  assert_eq!(
    count(&blank.db, &format!(r#"{tuples} WHERE "resource_type" = 'bmo_section'"#)).await,
    "1"
  );
  for projection in ["relation_definitions", "permission_definitions"] {
    assert_eq!(
      count(
        &blank.db,
        &format!(r#"SELECT COUNT(*) FROM "{projection}" WHERE "resource_type" = 'bmo_room'"#)
      )
      .await,
      "0",
      "{projection}"
    );
  }
  assert_eq!(
    count(&blank.db, "SELECT COUNT(*) FROM pg_tables WHERE tablename = 'grant_words'").await,
    "0"
  );

  // The service stands on it, the rules it runs declaring no room kind.
  stand(blank.db.clone(), Arc::new(Leaders::default()), names())
    .await
    .expect("the rules stand");

  // Taken down, the table stands empty in the baseline's shape and the room kind's relations stand again, holding no
  // tuple; the service's start then drops the relations its rules do not declare.
  Migrator::down(&blank.db, Some(1)).await.unwrap();

  assert_eq!(shape(&blank.db).await, shape(&baseline.db).await);
  assert_eq!(count(&blank.db, r#"SELECT COUNT(*) FROM "grant_words""#).await, "0");

  let room_relations = r#"SELECT COUNT(*) FROM "relation_definitions" WHERE "resource_type" = 'bmo_room'"#;

  assert_eq!(count(&blank.db, room_relations).await, "15");
  assert_eq!(count(&blank.db, &format!(r#"{tuples} WHERE "resource_type" = 'bmo_room'"#)).await, "0");

  stand(blank.db.clone(), Arc::new(Leaders::default()), names())
    .await
    .expect("the rules stand");
  assert_eq!(count(&blank.db, room_relations).await, "0");
}

#[tokio::test]
async fn the_object_kinds_removal_takes_what_agent_objects_held_and_its_way_down_gives_their_relations_back()
 {
  ready();
  let blank = Blank::new().await;

  Migrator::up(&blank.db, Some(2)).await.unwrap();

  // What a release declaring the agent object kinds left: their projection and a grant on each, and a section's
  // grant, which stays.
  blank
    .db
    .execute_unprepared(
      r#"INSERT INTO "relation_definitions" ("resource_type", "relation", "kind", "subject_types") VALUES
           ('bmo_worker', 'run', 'stored', '{user}'), ('bmo_repository', 'change', 'stored', '{user}'),
           ('bmo_tools', 'use', 'stored', '{user}'), ('bmo_section', 'read', 'stored', '{user}');
         INSERT INTO "permission_definitions" ("resource_type", "permission", "rewrite") VALUES
           ('bmo_worker', 'may_run', '{}'), ('bmo_tools', 'may_use', '{}');
         INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation") VALUES
           ('bmo_worker', 'worker-a', 'run', 'user', '1', ''), ('bmo_repository', 'repo-a', 'change', 'user', '1', ''),
           ('bmo_tools', 'room.tools', 'use', 'user', '1', ''), ('bmo_section', 'notes', 'read', 'user', '1', '');"#,
    )
    .await
    .unwrap();

  Migrator::up(&blank.db, None).await.unwrap();

  let kinds = r#""resource_type" IN ('bmo_worker', 'bmo_repository', 'bmo_tools')"#;
  let tuples = r#"SELECT COUNT(*) FROM "relation_tuples""#;

  assert_eq!(count(&blank.db, &format!("{tuples} WHERE {kinds}")).await, "0");
  assert_eq!(
    count(&blank.db, &format!(r#"{tuples} WHERE "resource_type" = 'bmo_section'"#)).await,
    "1"
  );
  for projection in ["relation_definitions", "permission_definitions"] {
    assert_eq!(
      count(&blank.db, &format!(r#"SELECT COUNT(*) FROM "{projection}" WHERE {kinds}"#)).await,
      "0",
      "{projection}"
    );
  }

  // The service stands on it, the rules it runs declaring none of the kinds.
  stand(blank.db.clone(), Arc::new(Leaders::default()), names())
    .await
    .expect("the rules stand");

  // Taken down, the four relations stand again, holding no tuple; the service's start then drops them.
  Migrator::down(&blank.db, Some(1)).await.unwrap();

  let relations = format!(r#"SELECT COUNT(*) FROM "relation_definitions" WHERE {kinds}"#);

  assert_eq!(count(&blank.db, &relations).await, "4");
  assert_eq!(count(&blank.db, &format!("{tuples} WHERE {kinds}")).await, "0");

  stand(blank.db.clone(), Arc::new(Leaders::default()), names())
    .await
    .expect("the rules stand");
  assert_eq!(count(&blank.db, &relations).await, "0");
}
