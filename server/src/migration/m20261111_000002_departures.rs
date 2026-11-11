//! The accounts of people who left (docs/accounts.md, 「A person who leaves」, 「The tables」).

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261111_000002_departures"
  }
}

pub const DEPARTURES: &str = r#"
CREATE TABLE IF NOT EXISTS "user_departures" (
  "user_id" bigint PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "left_at" bigint NOT NULL,
  "left_by" bigint NOT NULL
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(DEPARTURES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "user_departures""#)
      .await?;

    Ok(())
  }
}
