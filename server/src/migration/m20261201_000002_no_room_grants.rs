//! The room relations taken away (docs/accounts.md, 「The tables」): its way up deletes every tuple on a room and every
//! tuple naming a room's members, the room kind's rows of the rules' projection, and the `grant_words` table; its way
//! down makes `grant_words` again, empty, and the room kind's fifteen relations, holding no tuple.

use sea_orm_migration::prelude::*;

pub const NAME: &str = "m20261201_000002_no_room_grants";

/// The way up, as the tests lay it on a database by hand.
pub const UP: &str = include_str!("no_room_grants.sql");

/// The way down.
pub const DOWN: &str = include_str!("no_room_grants.down.sql");

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
