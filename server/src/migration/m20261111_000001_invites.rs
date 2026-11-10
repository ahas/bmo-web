//! Invitations and the machines invited accounts are bound to (docs/accounts.md, 「Invitations and a person's
//! machine」, 「The tables」).

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261111_000001_invites"
  }
}

pub const INVITES: &str = r#"
CREATE TABLE IF NOT EXISTS "user_invites" (
  "token" text PRIMARY KEY,
  "unit_id" bigint NOT NULL,
  "head" boolean NOT NULL DEFAULT false,
  "made_by" bigint NOT NULL,
  "created_at" bigint NOT NULL,
  "expires_at" bigint NOT NULL,
  "used_by" bigint,
  "used_at" bigint
);
CREATE TABLE IF NOT EXISTS "user_nodes" (
  "user_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "agent" text NOT NULL UNIQUE,
  "proven_at" bigint,
  PRIMARY KEY ("user_id")
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(INVITES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "user_nodes"; DROP TABLE IF EXISTS "user_invites""#)
      .await?;

    Ok(())
  }
}
