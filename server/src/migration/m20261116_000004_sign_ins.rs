//! When each user last signed in (docs/accounts.md, 「The people roster」, 「The tables」).

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261116_000004_sign_ins"
  }
}

pub const SIGN_INS: &str = r#"
CREATE TABLE IF NOT EXISTS "user_sign_ins" (
  "user_id" bigint PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "signed_in_at" bigint NOT NULL
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(SIGN_INS).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "user_sign_ins""#)
      .await?;

    Ok(())
  }
}
