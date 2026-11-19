//! The supply tables (docs/accounts.md, 「Supply」): the policy of each layer, the platform's money settings,
//! the reservations this service opens for the agency and the costs it settles, and the audit of every act
//! an outsider must be able to name. The platform policy and the settings stand with their seeded defaults.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261119_000001_supply"
  }
}

pub const SUPPLY_TABLES: &str = r#"
CREATE TABLE IF NOT EXISTS "supply_platform_policy" (
  "id" integer PRIMARY KEY CHECK ("id" = 1),
  "allowed" jsonb NOT NULL,
  "order" jsonb NOT NULL,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint
);

CREATE TABLE IF NOT EXISTS "supply_settings" (
  "id" integer PRIMARY KEY CHECK ("id" = 1),
  "credits_per_dollar" bigint NOT NULL,
  "reservation_credits" bigint NOT NULL,
  "enforce" boolean NOT NULL,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint
);

CREATE TABLE IF NOT EXISTS "supply_org_policies" (
  "org_id" bigint PRIMARY KEY,
  "allowed" jsonb NOT NULL,
  "order" jsonb NOT NULL,
  "member_credit_credits" bigint,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint
);

CREATE TABLE IF NOT EXISTS "supply_user_policies" (
  "user_id" bigint PRIMARY KEY,
  "allowed" jsonb NOT NULL,
  "order" jsonb NOT NULL,
  "member_credit_credits" bigint,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint
);

CREATE TABLE IF NOT EXISTS "supply_user_settings" (
  "user_id" bigint PRIMARY KEY,
  "order" jsonb NOT NULL,
  "off" jsonb NOT NULL,
  "personal_credits_on" boolean NOT NULL DEFAULT false,
  "personal_credit_credits" bigint,
  "updated_at" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "supply_reservations" (
  "id" text PRIMARY KEY,
  "run" bigint NOT NULL,
  "step" integer NOT NULL,
  "user_id" bigint NOT NULL,
  "source" text NOT NULL,
  "amount_credits" bigint NOT NULL,
  "spent_credits" bigint NOT NULL DEFAULT 0,
  "expires_at" bigint NOT NULL,
  "state" text NOT NULL CHECK ("state" IN ('open', 'captured', 'released')),
  "sumida_reference" text,
  "key" text NOT NULL UNIQUE,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "supply_reservations_run" ON "supply_reservations" ("run", "step");

CREATE TABLE IF NOT EXISTS "supply_costs" (
  "id" bigserial PRIMARY KEY,
  "run" bigint NOT NULL,
  "user_id" bigint NOT NULL,
  "org_id" bigint,
  "source" text NOT NULL,
  "credits" bigint NOT NULL,
  "cost_micros" bigint NOT NULL,
  "settled_at" bigint NOT NULL,
  "period" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "supply_costs_period_source" ON "supply_costs" ("period", "source");
CREATE INDEX IF NOT EXISTS "supply_costs_period_org" ON "supply_costs" ("period", "org_id", "user_id");

CREATE TABLE IF NOT EXISTS "supply_audit" (
  "id" bigserial PRIMARY KEY,
  "at" bigint NOT NULL,
  "by" bigint NOT NULL,
  "kind" text NOT NULL,
  "subject" text NOT NULL,
  "detail" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "supply_audit_at" ON "supply_audit" ("id");
"#;

/// The seeded defaults the platform stands with until its administrator changes them.
pub const SUPPLY_SEEDS: &str = r#"
INSERT INTO "supply_platform_policy" ("id", "allowed", "order", "updated_at", "updated_by")
VALUES (1, '["personal", "global"]', '["personal", "global", "stop"]', 0, NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "supply_settings"
  ("id", "credits_per_dollar", "reservation_credits", "enforce", "updated_at", "updated_by")
VALUES (1, 1500, 200, false, 0, NULL)
ON CONFLICT ("id") DO NOTHING;
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    let db = manager.get_connection();

    db.execute_unprepared(SUPPLY_TABLES).await?;
    db.execute_unprepared(SUPPLY_SEEDS).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(
        r#"DROP TABLE IF EXISTS "supply_audit";
           DROP TABLE IF EXISTS "supply_costs";
           DROP TABLE IF EXISTS "supply_reservations";
           DROP TABLE IF EXISTS "supply_user_settings";
           DROP TABLE IF EXISTS "supply_user_policies";
           DROP TABLE IF EXISTS "supply_org_policies";
           DROP TABLE IF EXISTS "supply_settings";
           DROP TABLE IF EXISTS "supply_platform_policy";"#,
      )
      .await?;

    Ok(())
  }
}
