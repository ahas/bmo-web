//! The accounts that turned their presence off (docs/accounts.md, 「Showing one's presence」, 「The tables」): the
//! console's own table, which the console reads and writes; an account showing its presence has no row.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261117_000001_presence_hidden"
  }
}

pub const PRESENCE_HIDDEN: &str = r#"
CREATE TABLE IF NOT EXISTS "web_presence_hidden" (
  "user_id" bigint,
  "hidden_at" bigint NOT NULL,
  PRIMARY KEY ("user_id")
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(PRESENCE_HIDDEN).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "web_presence_hidden""#)
      .await?;

    Ok(())
  }
}
