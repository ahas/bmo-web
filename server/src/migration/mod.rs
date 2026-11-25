//! The service's migrations (docs/accounts.md, 「The tables」): the 1.0.0 baseline, which makes the whole schema,
//! sumida's tables among it, and the migrations after it, run by sea-orm's migrator, which keeps the versions it
//! ran in its own table. sumida runs no migrations of its own on this database; its boards and files stay unmade,
//! and its rules over them read as absent. Every place that migrates goes through `up`.

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{
  ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait,
};

pub mod m20261201_000001_baseline;
pub mod m20261201_000002_no_room_grants;
pub mod m20261201_000003_no_object_kinds;
mod secret_kind_seeds;

/// The table the migrator keeps its record in, which is no part of the service's shape.
pub const MIGRATIONS_TABLE: &str = "seaql_migrations";

/// The migration that makes the schema whole.
pub const BASELINE: &str = m20261201_000001_baseline::NAME;

/// The migrations after the baseline, in the order they run, each with its way up as SQL.
pub const LATER: [(&str, &str); 2] = [
  (m20261201_000002_no_room_grants::NAME, m20261201_000002_no_room_grants::UP),
  (m20261201_000003_no_object_kinds::NAME, m20261201_000003_no_object_kinds::UP),
];

/// The record an install from before 1.0.0 holds once every migration of its last release ran, sumida's among
/// them, in the order that release ran them. Its schema is the baseline's.
pub const BEFORE: [&str; 31] = [
  "m20261019_000000_extensions",
  "init",
  "rebac",
  "access_log",
  "m20261019_000001_tables",
  "m20261019_000002_document_talk",
  "m20261104_000001_user_profiles",
  "m20261111_000001_invites",
  "m20261111_000002_departures",
  "m20261112_000001_secret_kinds",
  "m20261115_000001_card_and_delivery_kinds",
  "m20261116_000001_shared_nodes",
  "m20261116_000002_invite_names",
  "m20261116_000003_agent_profiles",
  "m20261116_000004_sign_ins",
  "m20261117_000001_presence_hidden",
  "m20261118_000001_organisation_roles",
  "m20261118_000002_node_bound_at",
  "membership",
  "membership_metering",
  "m20261119_000001_supply",
  "m20261120_000001_supply_overrides",
  "m20261123_000001_delegation_chain",
  "m20261124_000001_agent_defaults_on_chain",
  "m20261125_000001_languages",
  "m20261126_000001_supply_run_keys",
  "m20261127_000001_supply_sources_one",
  "m20261128_000001_account_security",
  "m20261129_000001_guides",
  "m20261130_000001_removals",
  "m20261130_000007_machine_share_asks",
];

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
  fn migrations() -> Vec<Box<dyn MigrationTrait>> {
    vec![
      Box::new(m20261201_000001_baseline::Migration),
      Box::new(m20261201_000002_no_room_grants::Migration),
      Box::new(m20261201_000003_no_object_kinds::Migration),
    ]
  }
}

/// The migrations up over the database an address names.
pub async fn migrate(address: &str) -> Result<(), DbErr> {
  let mut options = sea_orm_migration::sea_orm::ConnectOptions::new(address.to_owned());

  options.sqlx_logging(false);

  let db = sea_orm_migration::sea_orm::Database::connect(options).await?;

  up(&db).await?;
  db.close().await?;

  Ok(())
}

/// Every migration a database has not run yet, run on it, once an install from before 1.0.0 is taken as it
/// stands.
pub async fn up(db: &DatabaseConnection) -> Result<(), DbErr> {
  adopt(db).await?;

  Migrator::up(db, None).await
}

/// A record naming every migration of the last release before 1.0.0, and nothing else, rewritten to name the
/// baseline alone in one transaction, touching no table and no row; one naming only part of them refused with
/// the last of them it holds. A database with no record, or an empty one, is left to the migrator.
async fn adopt(db: &DatabaseConnection) -> Result<(), DbErr> {
  let tx = db.begin().await?;
  let statement = |sql: String, values: Vec<sea_orm::Value>| {
    Statement::from_sql_and_values(DbBackend::Postgres, sql, values)
  };
  let recorded = tx
    .query_one(statement(
      format!("SELECT to_regclass('{MIGRATIONS_TABLE}') IS NOT NULL AS held"),
      vec![],
    ))
    .await?
    .map(|row| row.try_get::<bool>("", "held"))
    .transpose()?
    .unwrap_or(false);

  if !recorded {
    return Ok(());
  }

  tx.execute_unprepared(&format!(r#"LOCK TABLE "{MIGRATIONS_TABLE}" IN EXCLUSIVE MODE"#))
    .await?;

  let held = tx
    .query_all(statement(format!(r#"SELECT "version" FROM "{MIGRATIONS_TABLE}""#), vec![]))
    .await?
    .into_iter()
    .map(|row| row.try_get::<String>("", "version"))
    .collect::<Result<Vec<_>, _>>()?;

  if held.is_empty() || !held.iter().all(|version| BEFORE.contains(&version.as_str())) {
    return Ok(());
  }

  if held.len() != BEFORE.len() {
    let reached = BEFORE
      .iter()
      .rev()
      .find(|name| held.iter().any(|version| version == *name))
      .unwrap_or(&"");

    return Err(DbErr::Migration(format!(
      "the database holds the migrations of a release before 1.0.0 only through {reached}; that release's \
       last migration runs first"
    )));
  }

  tx.execute_unprepared(&format!(r#"DELETE FROM "{MIGRATIONS_TABLE}""#)).await?;
  tx.execute(statement(
    format!(
      r#"INSERT INTO "{MIGRATIONS_TABLE}" ("version", "applied_at") VALUES ($1, EXTRACT(EPOCH FROM now())::bigint)"#
    ),
    vec![BASELINE.into()],
  ))
  .await?;
  tx.commit().await
}
