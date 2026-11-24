//! Which supply sources a person's runs may take is decided by this service alone (docs/accounts.md, 「Supply」):
//!
//! - `supply.organisation`, whether organisation supply stands open, is this service's kind from now on, its links
//!   kept as they stand;
//! - the agency's flags `supply.personal` and `supply.platform` are read into the supply policies they duplicate:
//!   each link or rule that turned a source off becomes that source taken out of the policy of the same link — the
//!   platform's, a unit's and every policy of a unit under it, or a person's — a unit or a person holding no policy
//!   given the one standing above it, or every source, less the closed ones; a group's rule closes it for each of
//!   its members. The flags' links, rules and declarations are then taken away;
//! - the monthly cap of a unit's and a per-user policy, `memberCreditCredits`, becomes the link's credit allowance,
//!   `supply.credit-allowance`, the smaller where both stood, and leaves the policy.
//!
//! Taken down, the caps stand in the policies again from the allowances and `supply.organisation` is the agency's
//! once more; the flags' closures stay in the policies, which hold the same effect.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261127_000001_supply_sources_one"
  }
}

pub const ONE: &str = r#"
UPDATE "chain_kinds"
   SET "declared_by" = 'web', "declaration" = jsonb_set("declaration", '{declaredBy}', '"web"')
 WHERE "key" = 'supply.organisation';

CREATE TEMP TABLE "supply_closing" ("unit_id" bigint, "user_id" bigint, "sources" text[] NOT NULL);

INSERT INTO "supply_closing" ("unit_id", "user_id", "sources")
SELECT l."unit_id", l."user_id",
       CASE l."kind" WHEN 'supply.personal' THEN ARRAY['personal']
                     ELSE ARRAY['global', 'org_credits', 'personal_credits'] END
  FROM "chain_links" l
 WHERE l."kind" IN ('supply.personal', 'supply.platform') AND l."value" = 'false'::jsonb;

INSERT INTO "supply_closing" ("unit_id", "user_id", "sources")
SELECT r."who_unit", COALESCE(r."who_user", m."user_id"),
       CASE r."kind" WHEN 'supply.personal' THEN ARRAY['personal']
                     ELSE ARRAY['global', 'org_credits', 'personal_credits'] END
  FROM "chain_rules" r
  LEFT JOIN "chain_group_members" m ON m."group_id" = r."who_group"
 WHERE r."kind" IN ('supply.personal', 'supply.platform') AND r."value" = 'false'::jsonb
   AND (r."who_group" IS NULL OR m."user_id" IS NOT NULL);

-- The platform: its policy, the kind's default where it holds none, less what it closed.
INSERT INTO "chain_links" ("kind", "link", "value", "delegation", "set_at")
SELECT 'supply.policy', 'platform',
       '{"allowed":["personal"],"order":["personal","stop"],"overridable":["personal"],"orderOverridable":true}'::jsonb,
       'inherit', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
 WHERE EXISTS (SELECT 1 FROM "supply_closing" WHERE "unit_id" IS NULL AND "user_id" IS NULL)
ON CONFLICT ("kind", "link") DO UPDATE SET "value" = COALESCE("chain_links"."value", EXCLUDED."value");

UPDATE "chain_links" l
   SET "value" = jsonb_set(jsonb_set(jsonb_set(l."value",
                   '{allowed}', (l."value" -> 'allowed') - c."sources"),
                   '{order}', (l."value" -> 'order') - c."sources"),
                   '{overridable}', (l."value" -> 'overridable') - c."sources")
  FROM (SELECT array_agg(DISTINCT s) AS "sources"
          FROM "supply_closing", unnest("sources") s
         WHERE "unit_id" IS NULL AND "user_id" IS NULL) c
 WHERE l."kind" = 'supply.policy' AND l."link" = 'platform' AND c."sources" IS NOT NULL;

-- A unit closing a source with no policy of its own takes the nearest one above it, or every source.
WITH RECURSIVE "up" ("start", "unit", "depth") AS (
  SELECT c."unit_id", o."parent_id", 1
    FROM (SELECT DISTINCT "unit_id" FROM "supply_closing" WHERE "unit_id" IS NOT NULL) c
    JOIN "organizations" o ON o."id" = c."unit_id"
  UNION ALL
  SELECT u."start", o."parent_id", u."depth" + 1
    FROM "up" u JOIN "organizations" o ON o."id" = u."unit"
   WHERE u."unit" IS NOT NULL AND u."depth" < 64
), "nearest" AS (
  SELECT DISTINCT ON (u."start") u."start", l."value"
    FROM "up" u JOIN "chain_links" l ON l."kind" = 'supply.policy' AND l."unit_id" = u."unit"
   WHERE l."value" IS NOT NULL
   ORDER BY u."start", u."depth"
)
INSERT INTO "chain_links" ("kind", "link", "unit_id", "value", "delegation", "set_at")
SELECT 'supply.policy', 'unit:' || c."unit_id", c."unit_id",
       COALESCE(n."value",
                '{"allowed":["personal","global","org_credits","personal_credits"],"order":["personal","global","org_credits","personal_credits","stop"]}'::jsonb),
       'inherit', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
  FROM (SELECT DISTINCT "unit_id" FROM "supply_closing" WHERE "unit_id" IS NOT NULL) c
  JOIN "organizations" o ON o."id" = c."unit_id"
  LEFT JOIN "nearest" n ON n."start" = c."unit_id"
ON CONFLICT ("kind", "link") DO UPDATE SET "value" = COALESCE("chain_links"."value", EXCLUDED."value");

-- Every policy at or under a closing unit loses what it closed.
WITH RECURSIVE "down" ("unit", "sources", "depth") AS (
  SELECT "unit_id", "sources", 0 FROM "supply_closing" WHERE "unit_id" IS NOT NULL
  UNION ALL
  SELECT o."id", d."sources", d."depth" + 1
    FROM "down" d JOIN "organizations" o ON o."parent_id" = d."unit"
   WHERE d."depth" < 64
), "closed" AS (
  SELECT d."unit", array_agg(DISTINCT s) AS "sources" FROM "down" d, unnest(d."sources") s GROUP BY d."unit"
)
UPDATE "chain_links" l
   SET "value" = jsonb_set(jsonb_set(l."value",
                   '{allowed}', (l."value" -> 'allowed') - c."sources"),
                   '{order}', (l."value" -> 'order') - c."sources")
  FROM "closed" c
 WHERE l."kind" = 'supply.policy' AND l."unit_id" = c."unit" AND l."value" IS NOT NULL;

-- A person closing a source: their per-user policy, every source where they held none, less what it closed.
INSERT INTO "chain_links" ("kind", "link", "user_id", "value", "delegation", "set_at")
SELECT DISTINCT 'supply.policy', 'person:' || c."user_id", c."user_id",
       '{"allowed":["personal","global","org_credits","personal_credits"],"order":["personal","global","org_credits","personal_credits","stop"]}'::jsonb,
       'inherit', (EXTRACT(EPOCH FROM now()) * 1000)::bigint
  FROM "supply_closing" c JOIN "users" u ON u."id" = c."user_id"
ON CONFLICT ("kind", "link") DO UPDATE SET "value" = COALESCE("chain_links"."value", EXCLUDED."value");

UPDATE "chain_links" l
   SET "value" = jsonb_set(jsonb_set(l."value",
                   '{allowed}', (l."value" -> 'allowed') - c."sources"),
                   '{order}', (l."value" -> 'order') - c."sources")
  FROM (SELECT "user_id", array_agg(DISTINCT s) AS "sources"
          FROM "supply_closing", unnest("sources") s
         WHERE "user_id" IS NOT NULL GROUP BY "user_id") c
 WHERE l."kind" = 'supply.policy' AND l."user_id" = c."user_id" AND l."value" IS NOT NULL;

DROP TABLE "supply_closing";

DELETE FROM "chain_rules" WHERE "kind" IN ('supply.personal', 'supply.platform');
DELETE FROM "chain_links" WHERE "kind" IN ('supply.personal', 'supply.platform');
DELETE FROM "chain_kinds" WHERE "key" IN ('supply.personal', 'supply.platform');

-- A policy's monthly cap becomes its link's credit allowance, the smaller where both stood.
INSERT INTO "chain_links" ("kind", "link", "unit_id", "user_id", "value", "delegation", "set_by", "set_at")
SELECT 'supply.credit-allowance', l."link", l."unit_id", l."user_id", l."value" -> 'memberCreditCredits',
       'inherit', l."set_by", l."set_at"
  FROM "chain_links" l
 WHERE l."kind" = 'supply.policy' AND jsonb_typeof(l."value" -> 'memberCreditCredits') = 'number'
ON CONFLICT ("kind", "link") DO UPDATE
   SET "value" = CASE WHEN jsonb_typeof("chain_links"."value") = 'number'
                      THEN to_jsonb(LEAST(("chain_links"."value")::text::bigint, (EXCLUDED."value")::text::bigint))
                      ELSE EXCLUDED."value" END;

UPDATE "chain_links" SET "value" = "value" - 'memberCreditCredits'
 WHERE "kind" = 'supply.policy' AND "value" ? 'memberCreditCredits';
"#;

pub const APART: &str = r#"
UPDATE "chain_links" p
   SET "value" = p."value" || jsonb_build_object('memberCreditCredits', a."value")
  FROM "chain_links" a
 WHERE p."kind" = 'supply.policy' AND a."kind" = 'supply.credit-allowance' AND a."link" = p."link"
   AND p."link" <> 'platform' AND p."value" IS NOT NULL AND jsonb_typeof(a."value") = 'number';

UPDATE "chain_kinds"
   SET "declared_by" = 'agency', "declaration" = jsonb_set("declaration", '{declaredBy}', '"agency"')
 WHERE "key" = 'supply.organisation';
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(ONE).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(APART).await?;

    Ok(())
  }
}
