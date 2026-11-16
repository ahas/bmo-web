//! A person's BMO profile (docs/accounts.md, 「A person's BMO profile」, 「The tables」): each company's default
//! for its people's BMOs, each person's own, kept whether or not they may use it, and the permission to
//! personalise one's BMO set on a unit or on a person. A company, a unit and a person are keyed by sumida's ids.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261116_000003_agent_profiles"
  }
}

pub const AGENT_PROFILES: &str = r#"
CREATE TABLE IF NOT EXISTS "company_agents" (
  "company_id" bigint PRIMARY KEY REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "name" text,
  "call_names" text[] NOT NULL DEFAULT '{}',
  "picture" bytea,
  "picture_type" text,
  "set_by" bigint,
  "set_at" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS "own_agents" (
  "user_id" bigint PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" text,
  "call_names" text[] NOT NULL DEFAULT '{}',
  "persona" text,
  "picture" bytea,
  "picture_type" text,
  "set_at" bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS "agent_permissions" (
  "unit_id" bigint UNIQUE REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id" bigint UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE,
  "allowed" boolean NOT NULL,
  "set_by" bigint,
  "set_at" bigint NOT NULL,
  CHECK (("unit_id" IS NULL) <> ("user_id" IS NULL))
);
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(AGENT_PROFILES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(
        r#"DROP TABLE IF EXISTS "agent_permissions"; DROP TABLE IF EXISTS "own_agents";
           DROP TABLE IF EXISTS "company_agents""#,
      )
      .await?;

    Ok(())
  }
}
