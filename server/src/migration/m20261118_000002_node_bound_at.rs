//! When an account was connected to its machine (docs/accounts.md, 「Invitations and a person's machine」, 「The
//! tables」). A binding made before the moment was kept answers none.

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261118_000002_node_bound_at"
  }
}

pub const NODE_BOUND_AT: &str = r#"
ALTER TABLE "user_nodes" ADD COLUMN IF NOT EXISTS "bound_at" bigint;
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(NODE_BOUND_AT).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"ALTER TABLE "user_nodes" DROP COLUMN IF EXISTS "bound_at""#)
      .await?;

    Ok(())
  }
}
