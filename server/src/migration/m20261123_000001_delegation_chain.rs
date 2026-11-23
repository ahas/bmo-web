//! The delegation chain (docs/accounts.md, 「The delegation chain」, 「The tables」): the kinds the units declare,
//! each link's entry and rules, and the named groups of people a rule may name. The settings that stood in tables of
//! their own move onto it whole: the permission to personalise one's BMO becomes `agent-profile.personalize`; the
//! platform's, each organisation's and each per-user supply policy the links of `supply.policy`; and each person's
//! own supply setting their link of `supply.own`. A row naming a unit or a person that no longer stands is read by
//! no answer, and is not carried over. Taken down, the old tables stand again with what the chain holds of them.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261123_000001_delegation_chain"
  }
}

pub const CHAIN: &str = r#"
CREATE TABLE IF NOT EXISTS "chain_kinds" (
  "key" text PRIMARY KEY,
  "declared_by" text NOT NULL,
  "declaration" jsonb NOT NULL,
  "declared_at" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "chain_groups" (
  "id" bigserial PRIMARY KEY,
  "unit_id" bigint NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "set_by" bigint,
  "set_at" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "chain_groups_unit" ON "chain_groups" ("unit_id");

CREATE TABLE IF NOT EXISTS "chain_group_members" (
  "group_id" bigint NOT NULL REFERENCES "chain_groups" ("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("group_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "chain_group_members_user" ON "chain_group_members" ("user_id");

CREATE TABLE IF NOT EXISTS "chain_links" (
  "kind" text NOT NULL,
  "link" text NOT NULL,
  "unit_id" bigint REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id" bigint REFERENCES "users" ("id") ON DELETE CASCADE,
  "value" jsonb,
  "delegation" text NOT NULL DEFAULT 'inherit' CHECK ("delegation" IN ('allow', 'lock', 'inherit')),
  "set_by" bigint,
  "set_at" bigint NOT NULL,
  PRIMARY KEY ("kind", "link"),
  CHECK ("unit_id" IS NULL OR "user_id" IS NULL),
  CHECK ("link" = CASE WHEN "unit_id" IS NOT NULL THEN 'unit:' || "unit_id"
                       WHEN "user_id" IS NOT NULL THEN 'person:' || "user_id"
                       ELSE 'platform' END)
);

CREATE TABLE IF NOT EXISTS "chain_rules" (
  "kind" text NOT NULL,
  "link" text NOT NULL,
  "unit_id" bigint REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "who" text NOT NULL,
  "who_user" bigint REFERENCES "users" ("id") ON DELETE CASCADE,
  "who_group" bigint REFERENCES "chain_groups" ("id") ON DELETE CASCADE,
  "who_unit" bigint REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "value" jsonb NOT NULL,
  "set_by" bigint,
  "set_at" bigint NOT NULL,
  PRIMARY KEY ("kind", "link", "who"),
  CHECK ("link" = CASE WHEN "unit_id" IS NOT NULL THEN 'unit:' || "unit_id" ELSE 'platform' END),
  CHECK ("who" = CASE WHEN "who_user" IS NOT NULL THEN 'person:' || "who_user"
                      WHEN "who_group" IS NOT NULL THEN 'group:' || "who_group"
                      ELSE 'unit:' || "who_unit" END),
  CHECK ((("who_user" IS NOT NULL)::int + ("who_group" IS NOT NULL)::int + ("who_unit" IS NOT NULL)::int) = 1)
);
CREATE INDEX IF NOT EXISTS "chain_rules_group" ON "chain_rules" ("who_group");

INSERT INTO "chain_links" ("kind", "link", "unit_id", "user_id", "value", "delegation", "set_by", "set_at")
SELECT 'agent-profile.personalize',
       CASE WHEN p."unit_id" IS NOT NULL THEN 'unit:' || p."unit_id" ELSE 'person:' || p."user_id" END,
       p."unit_id", p."user_id", to_jsonb(p."allowed"), 'inherit', p."set_by", p."set_at"
  FROM "agent_permissions" p;

INSERT INTO "chain_links" ("kind", "link", "value", "delegation", "set_by", "set_at")
SELECT 'supply.policy', 'platform',
       jsonb_build_object('allowed', p."allowed", 'order', p."order", 'overridable', p."overridable",
                          'orderOverridable', p."order_overridable"),
       'inherit', p."updated_by", p."updated_at"
  FROM "supply_platform_policy" p WHERE p."id" = 1;

INSERT INTO "chain_links" ("kind", "link", "unit_id", "value", "delegation", "set_by", "set_at")
SELECT 'supply.policy', 'unit:' || p."org_id", p."org_id",
       jsonb_build_object('allowed', p."allowed", 'order', p."order",
                          'memberCreditCredits', p."member_credit_credits"),
       'inherit', p."updated_by", p."updated_at"
  FROM "supply_org_policies" p
 WHERE EXISTS (SELECT 1 FROM "organizations" o WHERE o."id" = p."org_id");

INSERT INTO "chain_links" ("kind", "link", "user_id", "value", "delegation", "set_by", "set_at")
SELECT 'supply.policy', 'person:' || p."user_id", p."user_id",
       jsonb_build_object('allowed', p."allowed", 'order', p."order",
                          'memberCreditCredits', p."member_credit_credits"),
       'inherit', p."updated_by", p."updated_at"
  FROM "supply_user_policies" p
 WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."id" = p."user_id");

INSERT INTO "chain_links" ("kind", "link", "user_id", "value", "delegation", "set_by", "set_at")
SELECT 'supply.own', 'person:' || s."user_id", s."user_id",
       jsonb_build_object('order', s."order", 'off', s."off", 'on', s."on",
                          'personalCreditCredits', s."personal_credit_credits"),
       'inherit', s."user_id", s."updated_at"
  FROM "supply_user_settings" s
 WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."id" = s."user_id");

DROP TABLE "agent_permissions";
DROP TABLE "supply_platform_policy";
DROP TABLE "supply_org_policies";
DROP TABLE "supply_user_policies";
DROP TABLE "supply_user_settings";
"#;

/// The old tables as they stood, filled again from the chain, and the chain's own taken away.
pub const UNCHAIN: &str = r#"
CREATE TABLE IF NOT EXISTS "agent_permissions" (
  "unit_id" bigint UNIQUE REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "user_id" bigint UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE,
  "allowed" boolean NOT NULL,
  "set_by" bigint,
  "set_at" bigint NOT NULL,
  CHECK (("unit_id" IS NULL) <> ("user_id" IS NULL))
);
INSERT INTO "agent_permissions" ("unit_id", "user_id", "allowed", "set_by", "set_at")
SELECT "unit_id", "user_id", ("value")::text::boolean, "set_by", "set_at"
  FROM "chain_links"
 WHERE "kind" = 'agent-profile.personalize' AND "value" IS NOT NULL AND "link" <> 'platform';

CREATE TABLE IF NOT EXISTS "supply_platform_policy" (
  "id" integer PRIMARY KEY CHECK ("id" = 1),
  "allowed" jsonb NOT NULL,
  "order" jsonb NOT NULL,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint,
  "overridable" jsonb NOT NULL DEFAULT '[]',
  "order_overridable" boolean NOT NULL DEFAULT true
);
INSERT INTO "supply_platform_policy"
  ("id", "allowed", "order", "updated_at", "updated_by", "overridable", "order_overridable")
SELECT 1, "value" -> 'allowed', "value" -> 'order', "set_at", "set_by", "value" -> 'overridable',
       ("value" ->> 'orderOverridable')::boolean
  FROM "chain_links" WHERE "kind" = 'supply.policy' AND "link" = 'platform' AND "value" IS NOT NULL;
INSERT INTO "supply_platform_policy"
  ("id", "allowed", "order", "updated_at", "updated_by", "overridable", "order_overridable")
VALUES (1, '["personal"]', '["personal", "stop"]', 0, NULL, '["personal"]', true)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "supply_org_policies" (
  "org_id" bigint PRIMARY KEY,
  "allowed" jsonb NOT NULL,
  "order" jsonb NOT NULL,
  "member_credit_credits" bigint,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint
);
INSERT INTO "supply_org_policies"
  ("org_id", "allowed", "order", "member_credit_credits", "updated_at", "updated_by")
SELECT "unit_id", "value" -> 'allowed', "value" -> 'order', ("value" ->> 'memberCreditCredits')::bigint,
       "set_at", "set_by"
  FROM "chain_links" WHERE "kind" = 'supply.policy' AND "unit_id" IS NOT NULL AND "value" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "supply_user_policies" (
  "user_id" bigint PRIMARY KEY,
  "allowed" jsonb NOT NULL,
  "order" jsonb NOT NULL,
  "member_credit_credits" bigint,
  "updated_at" bigint NOT NULL,
  "updated_by" bigint
);
INSERT INTO "supply_user_policies"
  ("user_id", "allowed", "order", "member_credit_credits", "updated_at", "updated_by")
SELECT "user_id", "value" -> 'allowed', "value" -> 'order', ("value" ->> 'memberCreditCredits')::bigint,
       "set_at", "set_by"
  FROM "chain_links" WHERE "kind" = 'supply.policy' AND "user_id" IS NOT NULL AND "value" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "supply_user_settings" (
  "user_id" bigint PRIMARY KEY,
  "order" jsonb NOT NULL,
  "off" jsonb NOT NULL,
  "personal_credit_credits" bigint,
  "updated_at" bigint NOT NULL,
  "on" jsonb NOT NULL DEFAULT '[]'
);
INSERT INTO "supply_user_settings" ("user_id", "order", "off", "on", "personal_credit_credits", "updated_at")
SELECT "user_id", "value" -> 'order', "value" -> 'off', "value" -> 'on',
       ("value" ->> 'personalCreditCredits')::bigint, "set_at"
  FROM "chain_links" WHERE "kind" = 'supply.own' AND "user_id" IS NOT NULL AND "value" IS NOT NULL;

DROP TABLE IF EXISTS "chain_rules";
DROP TABLE IF EXISTS "chain_links";
DROP TABLE IF EXISTS "chain_group_members";
DROP TABLE IF EXISTS "chain_groups";
DROP TABLE IF EXISTS "chain_kinds";
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(CHAIN).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(UNCHAIN).await?;

    Ok(())
  }
}
