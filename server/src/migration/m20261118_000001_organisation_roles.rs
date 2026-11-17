//! A company's own words for its organisation and what stands on its units beside heads and members
//! (docs/accounts.md, 「Users and senders」, 「Roles and unit kinds」, 「Concurrent posts」, 「Acting」, 「A person's
//! history」 and 「The tables」): a person's rank and duty, the role and kind catalogues, a unit's attributes, the
//! role a person carries in their home unit, the posts, the acting appointments and the history of a person's
//! place.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261118_000001_organisation_roles"
  }
}

pub const ORGANISATION_ROLES: &str = r#"
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "rank" text NOT NULL DEFAULT '';
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "duty" text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "company_roles" (
  "id" bigserial PRIMARY KEY,
  "company_id" bigint NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "place" integer NOT NULL,
  UNIQUE ("company_id", "key")
);

CREATE TABLE IF NOT EXISTS "unit_kinds" (
  "id" bigserial PRIMARY KEY,
  "company_id" bigint NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "place" integer NOT NULL,
  UNIQUE ("company_id", "key")
);

CREATE TABLE IF NOT EXISTS "unit_attributes" (
  "unit_id" bigint PRIMARY KEY,
  "company_id" bigint NOT NULL,
  "kind_id" bigint REFERENCES "unit_kinds" ("id"),
  "short_name" text,
  "reports_to" bigint
);

CREATE UNIQUE INDEX IF NOT EXISTS "unit_attributes_short_name"
  ON "unit_attributes" ("company_id", lower("short_name")) WHERE "short_name" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id" bigint PRIMARY KEY,
  "role_id" bigint NOT NULL REFERENCES "company_roles" ("id")
);

CREATE TABLE IF NOT EXISTS "unit_posts" (
  "user_id" bigint NOT NULL,
  "unit_id" bigint NOT NULL,
  "role_id" bigint REFERENCES "company_roles" ("id"),
  "given_by" bigint,
  "given_at" bigint NOT NULL,
  PRIMARY KEY ("user_id", "unit_id")
);

CREATE INDEX IF NOT EXISTS "unit_posts_unit" ON "unit_posts" ("unit_id");

CREATE TABLE IF NOT EXISTS "unit_appointments" (
  "id" bigserial PRIMARY KEY,
  "unit_id" bigint NOT NULL,
  "user_id" bigint NOT NULL,
  "until" bigint NOT NULL,
  "made_by" bigint,
  "made_at" bigint NOT NULL,
  "ended_at" bigint,
  "ended_by" bigint
);

CREATE INDEX IF NOT EXISTS "unit_appointments_unit" ON "unit_appointments" ("unit_id", "user_id");

CREATE TABLE IF NOT EXISTS "org_history" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint NOT NULL,
  "at" bigint NOT NULL,
  "by" bigint,
  "change" text NOT NULL,
  "unit_id" bigint,
  "from_unit_id" bigint,
  "before_key" text,
  "before_name" text,
  "after_key" text,
  "after_name" text,
  "until" bigint
);

CREATE INDEX IF NOT EXISTS "org_history_user" ON "org_history" ("user_id", "id");
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(ORGANISATION_ROLES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(
        r#"DROP TABLE IF EXISTS "org_history";
           DROP TABLE IF EXISTS "unit_appointments";
           DROP TABLE IF EXISTS "unit_posts";
           DROP TABLE IF EXISTS "user_roles";
           DROP TABLE IF EXISTS "unit_attributes";
           DROP TABLE IF EXISTS "unit_kinds";
           DROP TABLE IF EXISTS "company_roles";
           ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "duty";
           ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "rank";"#,
      )
      .await?;

    Ok(())
  }
}
