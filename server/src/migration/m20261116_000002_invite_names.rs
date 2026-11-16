//! The person's name an invitation is made for (docs/accounts.md, 「Invitations and a person's machine」, 「The
//! tables」).

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261116_000002_invite_names"
  }
}

pub const INVITE_NAMES: &str = r#"
ALTER TABLE "user_invites" ADD COLUMN IF NOT EXISTS "full_name" text NOT NULL DEFAULT '';
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(INVITE_NAMES).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"ALTER TABLE "user_invites" DROP COLUMN IF EXISTS "full_name""#)
      .await?;

    Ok(())
  }
}
