//! The old archive's move into the account service's store (docs/accounts.md, and the migration plan's
//! table map for TODO #1923): one export directory read, this store written, nothing else touched.
//!
//! The export is the one the item's export hand wrote under
//! `workbench/worker/items/1923/exports/web/`: `manifest.json` with each source table's exact count and
//! key, and one NDJSON file a table. The import reads only that directory, refuses a store already
//! holding rows of its tables, and runs whole inside one transaction, so a dry run and a failed run
//! leave the store as it stood.
//!
//! Every table keeps its old name. `permission_definitions` and `relation_definitions` are not copied:
//! sumida rewrites both from the compiled rules at start, so they are derived, not carried. Nor is
//! `org_closure` written row by row: sumida's trigger rebuilds it from `organizations` as they are
//! inserted, and the compare proves the derived rows are the export's.
//!
//! The `settings` rows carried are the two keys the service reads from its own store: `users_moved_at`,
//! the mark the data move writes and the model is in force by, and `users_administrator`, the user the
//! console's tables default to. They go beside the accounts, so the store the import writes answers in
//! force without the move running again.

use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use sqlx::postgres::{PgPool, PgPoolOptions};

use crate::migration::migrate;

/// One table the import moves: its source and target name and the target's columns.
pub struct TableMap {
  pub source: &'static str,
  pub target: &'static str,
  pub columns: &'static [&'static str],
}

/// A table the store derives rather than one this import writes: sumida's trigger rebuilds
/// `org_closure` from `organizations` as they are written, so a copy would collide with the row it
/// has already made. The compare still reads it against the export.
pub fn derived(source: &str) -> bool {
  source == "org_closure"
}

/// Every table this import moves, in the order it writes them: the accounts first, since the rows
/// beside them name a user.
pub const TABLES: &[TableMap] = &[
  TableMap {
    source: "organizations",
    target: "organizations",
    columns: &["id", "name", "parent_id", "created_at", "updated_at"],
  },
  TableMap {
    source: "roles",
    target: "roles",
    columns: &["id", "name", "description", "created_at", "updated_at"],
  },
  TableMap {
    source: "users",
    target: "users",
    columns: &[
      "id",
      "username",
      "password",
      "email",
      "full_name",
      "phone",
      "role_id",
      "organization_id",
      "is_admin",
      "is_enabled",
      "credentials_reset_at",
      "created_at",
      "updated_at",
    ],
  },
  TableMap {
    source: "user_senders",
    target: "user_senders",
    columns: &["sender_id", "user_id", "linked_at"],
  },
  TableMap {
    source: "user_prefs",
    target: "user_prefs",
    columns: &["user_id", "data"],
  },
  TableMap {
    source: "user_invitations",
    target: "user_invitations",
    columns: &["uuid", "user_id", "expires_at", "created_at"],
  },
  TableMap {
    source: "user_verifications",
    target: "user_verifications",
    columns: &["user_id", "kind", "method", "code", "expires_at", "created_at"],
  },
  TableMap {
    source: "access_logs",
    target: "access_logs",
    columns: &[
      "id",
      "user_id",
      "method",
      "code",
      "count",
      "ip_address",
      "user_agent",
      "os_family",
      "os_major",
      "os_minor",
      "os_patch",
      "os_patch_minor",
      "device_family",
      "device_brand",
      "device_model",
      "created_at",
    ],
  },
  TableMap {
    source: "bans",
    target: "bans",
    columns: &[
      "id",
      "user_id",
      "ip_address",
      "user_agent",
      "os_family",
      "os_major",
      "os_minor",
      "os_patch",
      "os_patch_minor",
      "device_family",
      "device_brand",
      "device_model",
      "created_at",
      "created_by",
      "reason",
      "expires_at",
      "lifted_at",
      "note",
    ],
  },
  TableMap {
    source: "api_keys",
    target: "api_keys",
    columns: &["key", "key_prefix", "user_id", "expires_at", "is_secured", "created_at"],
  },
  // mail_forms is sumida's, not the move's: its `mail-form` feature makes the table and seeds the fixed
  // notices into it, so the import neither writes it nor counts it as a table the store must start empty of.
  TableMap {
    source: "org_closure",
    target: "org_closure",
    columns: &["descendant_id", "ancestor_id", "depth"],
  },
  TableMap {
    // The store gives the tuple its own number: the column is `GENERATED ALWAYS`, so the key the
    // compare reads is the tuple's own identity, not the old number.
    source: "relation_tuples",
    target: "relation_tuples",
    columns: &[
      "resource_type",
      "resource_id",
      "relation",
      "subject_type",
      "subject_id",
      "subject_relation",
      "expires_at",
      "created_at",
      "created_by",
    ],
  },
  TableMap {
    source: "grant_words",
    target: "grant_words",
    columns: &[
      "resource_type",
      "resource_id",
      "relation",
      "subject_key",
      "words",
      "message_chat",
      "message_id",
      "written_at",
    ],
  },
  TableMap {
    source: "document_talk",
    target: "document_talk",
    columns: &[
      "id",
      "document",
      "speaker",
      "text",
      "said_at",
      "passage",
      "heading",
      "version",
      "translated",
    ],
  },
  TableMap {
    source: "web_palettes",
    target: "web_palettes",
    columns: &["user_name", "palette", "updated_at", "user_id"],
  },
  TableMap {
    source: "web_push_devices",
    target: "web_push_devices",
    columns: &[
      "endpoint",
      "user_name",
      "p256dh",
      "auth",
      "kinds",
      "refused",
      "created_at",
      "last_sent_at",
      "user_id",
    ],
  },
  TableMap {
    source: "web_room_reads",
    target: "web_room_reads",
    columns: &[
      "user_name",
      "chat_id",
      "message_id",
      "sent_at",
      "row_order",
      "created_at",
      "read_at",
      "user_id",
    ],
  },
  TableMap {
    source: "web_tab_states",
    target: "web_tab_states",
    columns: &["user_name", "screen", "state", "updated_at", "user_id"],
  },
  TableMap {
    source: "web_themes",
    target: "web_themes",
    columns: &["user_name", "theme", "updated_at", "user_id"],
  },
  TableMap {
    source: "web_users",
    target: "web_users",
    columns: &["name", "password_hash", "created_at"],
  },
  TableMap {
    // The two keys the service reads from its own settings table, exported through the unit's key
    // filter: the move's mark and the administrator the console's tables default to.
    source: "settings",
    target: "settings",
    columns: &["key", "value"],
  },
];

/// One export table's entry in the manifest.
#[derive(Clone, Debug)]
pub struct TableEntry {
  pub file: String,
  pub count: u64,
  pub key: Vec<String>,
}

/// The export directory's manifest.
#[derive(Clone, Debug)]
pub struct Manifest {
  pub snapshot: String,
  pub read_at: String,
  pub tables: HashMap<String, TableEntry>,
}

/// One value written to the store, already in the target's shape.
#[derive(Clone, Debug, PartialEq)]
pub enum Cell {
  Null,
  Text(String),
}

/// One mapped row: the target's columns and the cell each takes.
pub type Mapped = Vec<(&'static str, Cell)>;
/// The rows of one table, in the order they are written.
pub type MappedRows = Vec<Mapped>;

/// One table of the report.
#[derive(Clone, Debug, PartialEq)]
pub struct Moved {
  pub source: String,
  pub exported: u64,
  pub written: u64,
}

/// What an import run did.
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
  pub dry_run: bool,
  pub snapshot: String,
  pub read_at: String,
  pub tables: Vec<Moved>,
  pub sample: Sample,
}

/// The count-and-sample compare's result.
#[derive(Clone, Debug, PartialEq)]
pub struct Sample {
  pub checked: usize,
  pub failures: Vec<String>,
}

/// One source row written in its target's columns, every value rendered as text and cast by the
/// target's own type.
pub fn row(table: &TableMap, old: &Value) -> Mapped {
  table
    .columns
    .iter()
    .map(|column| {
      let cell = match old.get(*column) {
        None | Some(Value::Null) => Cell::Null,
        Some(Value::String(said)) => Cell::Text(said.clone()),
        Some(Value::Bool(flag)) => Cell::Text(flag.to_string()),
        Some(Value::Number(number)) => Cell::Text(number.to_string()),
        Some(other) => Cell::Text(other.to_string()),
      };
      (*column, cell)
    })
    .collect()
}

/// The export directory's manifest.
pub fn read_manifest(dir: &Path) -> Result<Manifest, String> {
  let path = dir.join("manifest.json");
  let said = std::fs::read_to_string(&path)
    .map_err(|error| format!("{} could not be read: {error}", path.display()))?;
  let document: Value =
    serde_json::from_str(&said).map_err(|error| format!("{} is not JSON: {error}", path.display()))?;
  let mut tables = HashMap::new();
  let list = document.get("tables").and_then(Value::as_array).ok_or("the manifest names no tables")?;
  for table in list {
    let source = table
      .get("source")
      .and_then(Value::as_str)
      .ok_or("a manifest table names no source")?
      .to_owned();
    let file = table
      .get("file")
      .and_then(Value::as_str)
      .ok_or("a manifest table names no file")?
      .to_owned();
    let count = table.get("count").and_then(Value::as_u64).ok_or("a manifest table names no count")?;
    let key: Vec<String> = table
      .get("key")
      .and_then(Value::as_array)
      .map(|keys| keys.iter().filter_map(Value::as_str).map(str::to_owned).collect())
      .unwrap_or_default();
    tables.insert(source, TableEntry { file, count, key });
  }

  Ok(Manifest {
    snapshot: document.get("snapshot").and_then(Value::as_str).unwrap_or_default().to_owned(),
    read_at: document.get("readAt").and_then(Value::as_str).unwrap_or_default().to_owned(),
    tables,
  })
}

/// One table's rows, each checked against the manifest's count as it is read.
pub fn rows(dir: &Path, manifest: &Manifest, source: &str) -> Result<Vec<Value>, String> {
  let entry = manifest
    .tables
    .get(source)
    .ok_or_else(|| format!("the manifest has no table {source}"))?;
  let path = dir.join(&entry.file);
  let said = std::fs::read_to_string(&path)
    .map_err(|error| format!("{} could not be read: {error}", path.display()))?;
  let mut out = Vec::new();
  for (number, line) in said.lines().enumerate() {
    if line.trim().is_empty() {
      continue;
    }
    let row: Value = serde_json::from_str(line)
      .map_err(|error| format!("{} line {} is not JSON: {error}", path.display(), number + 1))?;
    out.push(row);
  }
  if out.len() as u64 != entry.count {
    return Err(format!(
      "{}: the manifest says {} rows and the file holds {}",
      path.display(),
      entry.count,
      out.len()
    ));
  }

  Ok(out)
}

/// The export read and mapped, before anything is written.
pub struct Prepared {
  pub manifest: Manifest,
  pub tables: Vec<(&'static str, &'static str, MappedRows)>,
}

/// Reads the export and maps every row to its target's shape.
pub fn prepare(export: &Path) -> Result<Prepared, String> {
  let manifest = read_manifest(export)?;
  let mut tables = Vec::new();
  for table in TABLES {
    let old = rows(export, &manifest, table.source)?;
    let mapped: Vec<_> = old.iter().map(|old| row(table, old)).collect();
    tables.push((table.source, table.target, mapped));
  }

  Ok(Prepared { manifest, tables })
}

/// The target's columns and their types, so every value can be cast from its text.
async fn types(pool: &PgPool, table: &str) -> Result<HashMap<String, String>, String> {
  let rows = sqlx::query(
    "SELECT column_name, data_type FROM information_schema.columns \
     WHERE table_schema = 'public' AND table_name = $1",
  )
  .bind(table)
  .fetch_all(pool)
  .await
  .map_err(|error| format!("{table}'s columns could not be read: {error}"))?;
  let mut out = HashMap::new();
  for row in rows {
    out.insert(row.get::<String, _>("column_name"), row.get::<String, _>("data_type"));
  }
  if out.is_empty() {
    return Err(format!("{table} holds no columns"));
  }

  Ok(out)
}

fn bind<'q>(
  mut query: sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments>,
  cell: &Cell,
) -> sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments> {
  let said = match cell {
    Cell::Null => None,
    Cell::Text(said) => Some(said.clone()),
  };
  query = query.bind(said);
  query
}

async fn insert(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  table: &str,
  kinds: &HashMap<String, String>,
  row: &[(&'static str, Cell)],
) -> Result<(), String> {
  let columns = row.iter().map(|(column, _)| format!("\"{column}\"")).collect::<Vec<_>>().join(", ");
  let values = row
    .iter()
    .enumerate()
    .map(|(position, (column, _))| {
      let kind = kinds.get(*column).map(String::as_str).unwrap_or("text");
      format!("CAST(${} AS {kind})", position + 1)
    })
    .collect::<Vec<_>>()
    .join(", ");
  let sql = format!("INSERT INTO \"{table}\" ({columns}) VALUES ({values})");
  let mut query = sqlx::query(&sql);
  for (_, cell) in row {
    query = bind(query, cell);
  }
  query
    .execute(&mut **tx)
    .await
    .map_err(|error| format!("{table} could not be written: {error}"))?;

  Ok(())
}

/// Refuses a store that already holds rows of any table this import writes.
pub async fn refused_if_holding(pool: &PgPool) -> Result<(), String> {
  let mut holding = Vec::new();
  for table in TABLES {
    let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{}\"", table.target))
      .fetch_one(pool)
      .await
      .map_err(|error| format!("{} could not be counted: {error}", table.target))?;
    if count > 0 {
      holding.push(format!("{} holds {count}", table.target));
    }
  }
  if holding.is_empty() {
    Ok(())
  } else {
    Err(format!(
      "the store already holds rows of its tables, so nothing was written: {}",
      holding.join(", ")
    ))
  }
}

fn digest(said: &str) -> String {
  Sha256::digest(said.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect()
}

fn key_text(row: &[(&'static str, Cell)], key: &[String]) -> String {
  key
    .iter()
    .map(|column| {
      row
        .iter()
        .find(|(held, _)| held == column)
        .map(|(_, cell)| format!("{cell:?}"))
        .unwrap_or_default()
    })
    .collect::<Vec<_>>()
    .join("|")
}

fn sample<'a>(rows: &'a [Mapped], key: &[String]) -> Vec<&'a Mapped> {
  if rows.len() <= 20 {
    return rows.iter().collect();
  }
  let mut ordered: Vec<(String, &Mapped)> =
    rows.iter().map(|row| (digest(&key_text(row, key)), row)).collect();
  ordered.sort_by(|left, right| left.0.cmp(&right.0));
  let mut picked: Vec<&Mapped> = vec![&rows[0], &rows[rows.len() - 1]];
  for (_, row) in ordered.into_iter().take(20) {
    if !picked.iter().any(|held| std::ptr::eq(*held, row)) {
      picked.push(row);
    }
  }

  picked
}

/// The key a table is sampled by: the export's own, but the tuple's whole identity where the store
/// numbers it itself.
fn key_for(source: &str, from_manifest: &[String]) -> Vec<String> {
  if source == "relation_tuples" {
    return [
      "resource_type",
      "resource_id",
      "relation",
      "subject_type",
      "subject_id",
      "subject_relation",
    ]
    .iter()
    .map(|column| (*column).to_owned())
    .collect();
  }

  from_manifest.to_vec()
}

/// What the store should hold for one written cell, read back as text: a time as epoch microseconds.
fn expected(column: &str, cell: &Cell, kinds: &HashMap<String, String>) -> Cell {
  match cell {
    Cell::Null => Cell::Null,
    Cell::Text(said) => {
      if kinds.get(column).map(String::as_str) == Some("timestamp with time zone") {
        match chrono::DateTime::parse_from_rfc3339(said) {
          Ok(at) => Cell::Text(at.timestamp_micros().to_string()),
          Err(_) => Cell::Text(said.clone()),
        }
      } else {
        Cell::Text(said.clone())
      }
    }
  }
}

async fn compare(pool: &PgPool, prepared: &Prepared) -> Sample {
  let mut failures = Vec::new();
  let mut checked = 0;
  for (source, target, rows) in &prepared.tables {
    let entry = match prepared.manifest.tables.get(*source) {
      Some(entry) => entry,
      None => continue,
    };
    let count: Result<i64, _> =
      sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{target}\"")).fetch_one(pool).await;
    match count {
      Ok(held) if held as u64 == entry.count => {}
      Ok(held) => {
        failures.push(format!("{source}: the export holds {} rows and {target} holds {held}", entry.count))
      }
      Err(error) => failures.push(format!("{source}: {target} could not be counted: {error}")),
    }
    let key = key_for(source, &entry.key);
    if key.is_empty() {
      failures.push(format!("{source}: the export records no key to sample by"));
      continue;
    }
    let kinds = match types(pool, target).await {
      Ok(kinds) => kinds,
      Err(error) => {
        failures.push(error);
        continue;
      }
    };
    for row in sample(rows, &key) {
      checked += 1;
      // Every compared column read as text: a time as epoch microseconds, so the source's own
      // spelling of it and PostgreSQL's compare as one instant.
      let selected = row
        .iter()
        .map(|(column, _)| {
          let kind = kinds.get(*column).map(String::as_str).unwrap_or("text");
          if kind == "timestamp with time zone" {
            format!("(EXTRACT(EPOCH FROM \"{column}\") * 1000000)::bigint::text AS \"{column}\"")
          } else {
            format!("\"{column}\"::text AS \"{column}\"")
          }
        })
        .collect::<Vec<_>>()
        .join(", ");
      let mut sql = format!("SELECT {selected} FROM \"{target}\" WHERE ");
      for (position, column) in key.iter().enumerate() {
        if position > 0 {
          sql.push_str(" AND ");
        }
        let kind = kinds.get(column).map(String::as_str).unwrap_or("text");
        sql.push_str(&format!("\"{column}\" = CAST(${} AS {kind})", position + 1));
      }
      let mut query = sqlx::query(&sql);
      let mut bound = true;
      for column in &key {
        match row.iter().find(|(held, _)| held == column).map(|(_, cell)| cell) {
          Some(cell) => query = bind(query, cell),
          None => {
            failures.push(format!("{source}: the mapped row carries no {column}"));
            bound = false;
            break;
          }
        }
      }
      if !bound {
        continue;
      }
      match query.fetch_optional(pool).await {
        Ok(Some(held)) => {
          for (column, cell) in row {
            let actual = held
              .try_get::<Option<String>, _>(*column)
              .map(|said| said.map_or(Cell::Null, Cell::Text));
            let expected = expected(column, cell, &kinds);
            match actual {
              Ok(actual) if actual == expected => {}
              Ok(actual) => failures
                .push(format!("{source} -> {target}: {column} was written {expected:?} but is {actual:?}")),
              Err(error) => {
                failures.push(format!("{source} -> {target}: {column} could not be read: {error}"))
              }
            }
          }
        }
        Ok(None) => failures.push(format!("{source} -> {target}: a sampled row is missing")),
        Err(error) => failures.push(format!("{source} -> {target}: the sample could not be read: {error}")),
      }
    }
  }

  Sample { checked, failures }
}

/// Runs the import: reads the export, refuses a store holding rows, writes every row, and compares
/// what it wrote. A dry run rolls the transaction back and reports what would have been written.
pub async fn run(database: &str, export: &Path, dry_run: bool) -> Result<Report, String> {
  let prepared = prepare(export)?;
  // The repository's own migrations, run over the store before anything is read into it.
  migrate(database).await.map_err(|error| format!("the migrations: {error}"))?;
  let pool = PgPoolOptions::new()
    .max_connections(1)
    .connect(database)
    .await
    .map_err(|error| format!("{database} could not be opened: {error}"))?;
  refused_if_holding(&pool).await?;

  let mut kinds: HashMap<&str, HashMap<String, String>> = HashMap::new();
  for (_, target, _) in &prepared.tables {
    kinds.insert(target, types(&pool, target).await?);
  }

  let mut tx = pool
    .begin()
    .await
    .map_err(|error| format!("the transaction could not be opened: {error}"))?;

  // The moved grants name relations the compiled rules declare, but the rules' projection into
  // `relation_definitions` is written at the service's start, after this import. A tuple's foreign
  // key needs each pair to stand now, so every pair the export names is filled with the placeholder
  // the service's own sync replaces with the compiled definition.
  if let Some((_, _, rows)) = prepared.tables.iter().find(|(source, _, _)| *source == "relation_tuples") {
    for row in rows {
      let said = |column: &str| {
        row.iter().find(|(held, _)| *held == column).and_then(|(_, cell)| match cell {
          Cell::Text(said) => Some(said.clone()),
          Cell::Null => None,
        })
      };
      if let (Some(resource), Some(relation)) = (said("resource_type"), said("relation")) {
        sqlx::query(
          "INSERT INTO relation_definitions (resource_type, relation, kind, subject_types) \
           VALUES ($1, $2, 'stored', '{}') ON CONFLICT DO NOTHING",
        )
        .bind(resource)
        .bind(relation)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("relation_definitions could not be filled: {error}"))?;
      }
    }
  }

  for (source, target, rows) in &prepared.tables {
    if derived(source) {
      continue;
    }
    let table_kinds = kinds.get(target).expect("a target's types");
    for row in rows {
      insert(&mut tx, target, table_kinds, row).await?;
    }
  }

  if dry_run {
    tx.rollback()
      .await
      .map_err(|error| format!("the dry run could not be rolled back: {error}"))?;
  } else {
    tx.commit()
      .await
      .map_err(|error| format!("the import could not be committed: {error}"))?;
  }

  let sample = if dry_run {
    Sample {
      checked: 0,
      failures: Vec::new(),
    }
  } else {
    compare(&pool, &prepared).await
  };

  let tables: Vec<Moved> = prepared
    .tables
    .iter()
    .map(|(source, _target, rows)| Moved {
      source: (*source).to_owned(),
      exported: prepared.manifest.tables.get(*source).map(|entry| entry.count).unwrap_or(0),
      written: rows.len() as u64,
    })
    .collect();
  pool.close().await;

  Ok(Report {
    dry_run,
    snapshot: prepared.manifest.snapshot.clone(),
    read_at: prepared.manifest.read_at.clone(),
    tables,
    sample,
  })
}

/// The count-and-sample compare alone, against a store the import wrote.
pub async fn verify(database: &str, export: &Path) -> Result<Sample, String> {
  let prepared = prepare(export)?;
  let pool = PgPoolOptions::new()
    .max_connections(1)
    .connect(database)
    .await
    .map_err(|error| format!("{database} could not be opened: {error}"))?;
  let sample = compare(&pool, &prepared).await;
  pool.close().await;

  Ok(sample)
}
