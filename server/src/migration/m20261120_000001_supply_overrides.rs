//! Which platform sources a person's own setting may change, the person's own switches against the platform's
//! default, and the plans each organisation unit is shown (docs/accounts.md, 「Supply」, 「An organisation's
//! plans」, 「The tables」).
//!
//! The platform row still standing as seeded takes the new defaults: the person's own credential alone, on and
//! overridable, the order overridable. A row an administrator set keeps what it allows, every source it allows
//! overridable: personal credits, which no person had until they switched them on, stand overridable and off.
//! A person's old personal-credits switch, where they had switched it on, becomes `personal_credits` in their `on`;
//! left off, it was the old default rather than a choice, and becomes none, so the platform's default stands.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261120_000001_supply_overrides"
  }
}

pub const SUPPLY_OVERRIDES: &str = r#"
ALTER TABLE "supply_platform_policy"
  ADD COLUMN IF NOT EXISTS "overridable" jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "order_overridable" boolean NOT NULL DEFAULT true;

UPDATE "supply_platform_policy"
   SET "allowed" = '["personal"]', "order" = '["personal", "stop"]', "overridable" = '["personal"]',
       "order_overridable" = true
 WHERE "id" = 1 AND "updated_by" IS NULL;

UPDATE "supply_platform_policy"
   SET "overridable" = "allowed", "allowed" = "allowed" - 'personal_credits', "order_overridable" = true
 WHERE "id" = 1 AND "updated_by" IS NOT NULL;

ALTER TABLE "supply_user_settings" ADD COLUMN IF NOT EXISTS "on" jsonb NOT NULL DEFAULT '[]';

UPDATE "supply_user_settings" SET "on" = '["personal_credits"]' WHERE "personal_credits_on";

ALTER TABLE "supply_user_settings" DROP COLUMN "personal_credits_on";

CREATE TABLE IF NOT EXISTS "supply_plan_exposures" (
  "org_id" bigint NOT NULL,
  "plan_id" bigint NOT NULL,
  "applied" boolean NOT NULL DEFAULT false,
  "set_by" bigint NOT NULL,
  "set_at" bigint NOT NULL,
  PRIMARY KEY ("org_id", "plan_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supply_plan_exposures_applied"
  ON "supply_plan_exposures" ("org_id") WHERE "applied";
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(SUPPLY_OVERRIDES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(
        r#"DROP TABLE IF EXISTS "supply_plan_exposures";
           ALTER TABLE "supply_user_settings"
             ADD COLUMN IF NOT EXISTS "personal_credits_on" boolean NOT NULL DEFAULT false;
           UPDATE "supply_user_settings" SET "personal_credits_on" = "on" ? 'personal_credits';
           ALTER TABLE "supply_user_settings" DROP COLUMN IF EXISTS "on";
           UPDATE "supply_platform_policy" SET "allowed" = "allowed" || '["personal_credits"]'
            WHERE "overridable" ? 'personal_credits' AND NOT ("allowed" ? 'personal_credits');
           ALTER TABLE "supply_platform_policy"
             DROP COLUMN IF EXISTS "overridable",
             DROP COLUMN IF EXISTS "order_overridable";"#,
      )
      .await?;

    Ok(())
  }
}
