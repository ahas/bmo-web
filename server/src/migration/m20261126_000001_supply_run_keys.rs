//! The run a supply reservation and a settled cost belong to, kept as the agency names it to the hook: its supply
//! key, a string (docs/accounts.md, 「The tables」; the agency's `docs/api.md`, 「Hook points」).

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261126_000001_supply_run_keys"
  }
}

pub const RUN_KEYS: &str = r#"
ALTER TABLE "supply_reservations" ALTER COLUMN "run" TYPE text USING "run"::text;
ALTER TABLE "supply_costs" ALTER COLUMN "run" TYPE text USING "run"::text;
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(RUN_KEYS).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(
        r#"DELETE FROM "supply_reservations" WHERE "run" !~ '^-?[0-9]+$';
           DELETE FROM "supply_costs" WHERE "run" !~ '^-?[0-9]+$';
           ALTER TABLE "supply_reservations" ALTER COLUMN "run" TYPE bigint USING "run"::bigint;
           ALTER TABLE "supply_costs" ALTER COLUMN "run" TYPE bigint USING "run"::bigint;"#,
      )
      .await?;

    Ok(())
  }
}
