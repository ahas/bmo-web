//! Each account's progress through the start guide (docs/accounts.md, 「The tables」; docs/web.md, 「The start
//! guide」): the console's own table, which the console reads and writes; an account that never opened the guide has
//! no row.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261129_000001_guides"
  }
}

pub const GUIDES: &str = r#"
CREATE TABLE IF NOT EXISTS "web_guides" (
  "user_id" bigint,
  "flow" text NOT NULL,
  "step" text NOT NULL,
  "need" text,
  "supply_later" boolean NOT NULL DEFAULT false,
  "road" text,
  "finished_at" bigint,
  "left_at" bigint,
  "updated_at" bigint NOT NULL,
  PRIMARY KEY ("user_id")
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(GUIDES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "web_guides""#)
      .await?;

    Ok(())
  }
}
