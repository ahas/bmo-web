//! The service's migrations (docs/accounts.md, 「The tables」), run by sea-orm's migrator, which keeps the
//! versions it ran in its own table. sumida's own tables are made by sumida's migrations, the ones its
//! users, keys, grants and membership domain need, its membership migrations after the service's own and its
//! metering migration after them as sumida asks (docs/accounts.md, 「Supply」); its boards and files stay
//! unmade, and its rules over them read as absent.

use sea_orm_migration::prelude::*;

mod m20261019_000000_extensions;
pub mod m20261019_000001_tables;
pub mod m20261019_000002_document_talk;
pub mod m20261104_000001_user_profiles;
pub mod m20261111_000001_invites;
pub mod m20261111_000002_departures;
pub mod m20261112_000001_secret_kinds;
pub mod m20261115_000001_card_and_delivery_kinds;
pub mod m20261116_000001_shared_nodes;
pub mod m20261116_000002_invite_names;
pub mod m20261116_000003_agent_profiles;
pub mod m20261116_000004_sign_ins;
pub mod m20261117_000001_presence_hidden;
pub mod m20261118_000001_organisation_roles;
pub mod m20261118_000002_node_bound_at;
pub mod m20261119_000001_supply;
mod secret_kind_seeds;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
  fn migrations() -> Vec<Box<dyn MigrationTrait>> {
    vec![
      Box::new(m20261019_000000_extensions::Migration),
      Box::new(sumida::entity::migration::init::Migration),
      Box::new(sumida::entity::migration::rebac::Migration),
      Box::new(sumida::entity::migration::access_log::Migration),
      Box::new(m20261019_000001_tables::Migration),
      Box::new(m20261019_000002_document_talk::Migration),
      Box::new(m20261104_000001_user_profiles::Migration),
      Box::new(m20261111_000001_invites::Migration),
      Box::new(m20261111_000002_departures::Migration),
      Box::new(m20261112_000001_secret_kinds::Migration),
      Box::new(m20261115_000001_card_and_delivery_kinds::Migration),
      Box::new(m20261116_000001_shared_nodes::Migration),
      Box::new(m20261116_000002_invite_names::Migration),
      Box::new(m20261116_000003_agent_profiles::Migration),
      Box::new(m20261116_000004_sign_ins::Migration),
      Box::new(m20261117_000001_presence_hidden::Migration),
      Box::new(m20261118_000001_organisation_roles::Migration),
      Box::new(m20261118_000002_node_bound_at::Migration),
      // sumida's membership schema and its metering change after it, registered after the service's own as
      // the domain asks; the supply tables the service answers the hook from stand after them.
      Box::new(sumida::entity::migration::membership::Migration),
      Box::new(sumida::entity::migration::membership_metering::Migration),
      Box::new(m20261119_000001_supply::Migration),
    ]
  }
}

/// The migrations up over the database an address names.
pub async fn migrate(address: &str) -> Result<(), DbErr> {
  let mut options = sea_orm_migration::sea_orm::ConnectOptions::new(address.to_owned());

  options.sqlx_logging(false);

  let db = sea_orm_migration::sea_orm::Database::connect(options).await?;

  Migrator::up(&db, None).await?;
  db.close().await?;

  Ok(())
}
