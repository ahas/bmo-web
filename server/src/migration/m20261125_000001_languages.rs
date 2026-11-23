//! The language each account reads the console in (docs/accounts.md, 「The tables」; docs/web.md, 「Wording and the
//! language pack」): the console's own table, which the console reads and writes, kept against the account as its
//! theme is; an account that never chose one has no row and reads the console in its browser's language.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261125_000001_languages"
  }
}

pub const LANGUAGES: &str = r#"
CREATE TABLE IF NOT EXISTS "web_languages" (
  "user_name" text NOT NULL,
  "language" text NOT NULL,
  "updated_at" bigint NOT NULL,
  "user_id" bigint,
  PRIMARY KEY ("user_name")
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(LANGUAGES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "web_languages""#)
      .await?;

    Ok(())
  }
}
