//! The agent object kinds taken away (docs/accounts.md, 「The tables」): its way up deletes every tuple on a worker, a
//! repository or a tool capability and those kinds' rows of the rules' projection; its way down makes their four
//! relations again, holding no tuple.

use sea_orm_migration::prelude::*;

pub const NAME: &str = "m20261201_000003_no_object_kinds";

/// The way up, as the tests lay it on a database by hand.
pub const UP: &str = include_str!("no_object_kinds.sql");

/// The way down.
pub const DOWN: &str = include_str!("no_object_kinds.down.sql");

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    NAME
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(UP).await?;

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(DOWN).await?;

    Ok(())
  }
}
