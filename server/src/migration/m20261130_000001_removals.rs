//! The record each permanent delete leaves (docs/accounts.md, 「The removal record」, 「The tables」): what went, an
//! account or a unit, its id, its login and name as they stood, who removed it and when, and every unit's result.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261130_000001_removals"
  }
}

pub const REMOVALS: &str = r#"
CREATE TABLE IF NOT EXISTS "removals" (
  "id" bigserial PRIMARY KEY,
  "what" text NOT NULL CHECK ("what" IN ('account', 'unit')),
  "subject" bigint NOT NULL,
  "login" text NOT NULL,
  "name" text NOT NULL,
  "removed_by" bigint,
  "removed_at" bigint NOT NULL,
  "result" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "removals_removed_at" ON "removals" ("removed_at" DESC);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(REMOVALS).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "removals""#)
      .await?;

    Ok(())
  }
}
