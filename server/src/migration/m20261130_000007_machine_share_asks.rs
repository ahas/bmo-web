//! Each invited account's ask to share a machine another agent holds (docs/accounts.md, 「A machine shared at an
//! invitation's ask」, 「The tables」).

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261130_000007_machine_share_asks"
  }
}

pub const MACHINE_SHARE_ASKS: &str = r#"
CREATE TABLE IF NOT EXISTS "machine_share_asks" (
  "user_id" bigint PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "agent" text NOT NULL,
  "asked_at" bigint NOT NULL,
  "state" text NOT NULL DEFAULT 'asked',
  "decided_by" bigint,
  "decided_at" bigint
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(MACHINE_SHARE_ASKS).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "machine_share_asks""#)
      .await?;

    Ok(())
  }
}
