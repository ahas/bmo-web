//! Whether an account's machine is one several accounts share (docs/accounts.md, 「Invitations and a person's
//! machine」, 「The tables」). Every binding made before is the account's alone, and a machine stays bound to one
//! account only where its binding is not shared.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261116_000001_shared_nodes"
  }
}

pub const SHARED_NODES: &str = r#"
ALTER TABLE "user_nodes" ADD COLUMN IF NOT EXISTS "shared" boolean NOT NULL DEFAULT false;
ALTER TABLE "user_nodes" DROP CONSTRAINT IF EXISTS "user_nodes_agent_key";
CREATE UNIQUE INDEX IF NOT EXISTS "user_nodes_unshared_agent" ON "user_nodes" ("agent") WHERE NOT "shared";
"#;

// Taken down, a machine is one account's again; a store holding a machine several accounts share refuses it.
const UNSHARED_NODES: &str = r#"
DROP INDEX IF EXISTS "user_nodes_unshared_agent";
ALTER TABLE "user_nodes" ADD CONSTRAINT "user_nodes_agent_key" UNIQUE ("agent");
ALTER TABLE "user_nodes" DROP COLUMN IF EXISTS "shared";
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(SHARED_NODES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(UNSHARED_NODES).await?;

    Ok(())
  }
}
