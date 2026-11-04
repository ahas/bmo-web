//! A user's profile (docs/accounts.md, 「Users and senders」, 「The tables」): the job title and the contact
//! details an account's holder or an administrator keeps, keyed by sumida's user. An account that keeps none
//! stands with no row, and every read answers empty values for it, so the accounts that stood before this
//! table keep working.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261104_000001_user_profiles"
  }
}

pub const USER_PROFILES: &str = r#"
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "user_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "job_title" text NOT NULL DEFAULT '',
  "landline" text NOT NULL DEFAULT '',
  "mobile" text NOT NULL DEFAULT '',
  "email" text NOT NULL DEFAULT '',
  "updated_at" bigint NOT NULL,
  PRIMARY KEY ("user_id")
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(USER_PROFILES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "user_profiles""#)
      .await?;

    Ok(())
  }
}
