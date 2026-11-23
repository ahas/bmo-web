//! An organisation's default for its people's BMOs moves onto the delegation chain (docs/accounts.md, 「A person's
//! BMO profile」): each company's name and call names become its links of `agent-profile.name` and
//! `agent-profile.call-names`, and a picture it keeps its link of `agent-profile.picture`, the bytes staying in
//! `company_agents` under the unit. A row keeping no picture is taken away, since the chain now holds the rest.
//! Taken down, the name and the call names stand again in `company_agents` with what the chain holds of them.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261124_000001_agent_defaults_on_chain"
  }
}

pub const ONTO_CHAIN: &str = r#"
INSERT INTO "chain_links" ("kind", "link", "unit_id", "value", "delegation", "set_by", "set_at")
SELECT 'agent-profile.name', 'unit:' || "company_id", "company_id", to_jsonb("name"), 'inherit', "set_by", "set_at"
  FROM "company_agents" WHERE "name" IS NOT NULL AND "name" <> ''
ON CONFLICT ("kind", "link") DO NOTHING;

INSERT INTO "chain_links" ("kind", "link", "unit_id", "value", "delegation", "set_by", "set_at")
SELECT 'agent-profile.call-names', 'unit:' || "company_id", "company_id", to_jsonb("call_names"), 'inherit',
       "set_by", "set_at"
  FROM "company_agents" WHERE cardinality("call_names") > 0
ON CONFLICT ("kind", "link") DO NOTHING;

INSERT INTO "chain_links" ("kind", "link", "unit_id", "value", "delegation", "set_by", "set_at")
SELECT 'agent-profile.picture', 'unit:' || "company_id", "company_id", 'true'::jsonb, 'inherit', "set_by", "set_at"
  FROM "company_agents" WHERE "picture" IS NOT NULL
ON CONFLICT ("kind", "link") DO NOTHING;

DELETE FROM "company_agents" WHERE "picture" IS NULL;
ALTER TABLE "company_agents" DROP COLUMN "name";
ALTER TABLE "company_agents" DROP COLUMN "call_names";
"#;

pub const OFF_CHAIN: &str = r#"
ALTER TABLE "company_agents" ADD COLUMN "name" text;
ALTER TABLE "company_agents" ADD COLUMN "call_names" text[] NOT NULL DEFAULT '{}';

INSERT INTO "company_agents" ("company_id", "set_by", "set_at")
SELECT "unit_id", "set_by", "set_at" FROM "chain_links"
 WHERE "kind" IN ('agent-profile.name', 'agent-profile.call-names') AND "unit_id" IS NOT NULL
   AND "value" IS NOT NULL
ON CONFLICT ("company_id") DO NOTHING;

UPDATE "company_agents" a SET "name" = l."value" #>> '{}'
  FROM "chain_links" l
 WHERE l."kind" = 'agent-profile.name' AND l."unit_id" = a."company_id" AND l."value" IS NOT NULL;

UPDATE "company_agents" a
   SET "call_names" = ARRAY(SELECT jsonb_array_elements_text(l."value"))
  FROM "chain_links" l
 WHERE l."kind" = 'agent-profile.call-names' AND l."unit_id" = a."company_id" AND l."value" IS NOT NULL;

DELETE FROM "chain_links" WHERE "kind" IN ('agent-profile.name', 'agent-profile.call-names', 'agent-profile.picture');
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(ONTO_CHAIN).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(OFF_CHAIN).await?;

    Ok(())
  }
}
