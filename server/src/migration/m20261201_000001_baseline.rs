//! The service's schema at 1.0.0, whole (docs/accounts.md, 「The tables」): every table with its indexes,
//! sumida's among them, the rows a blank database starts with, and the default secret kinds; its way down drops
//! them all.

use bmo_web_client::SecretInput;
use sea_orm_migration::prelude::*;

use super::secret_kind_seeds::{FieldSeed, KindSeed, MASKED, OPTIONAL, REQUIRED, SHOWN, seed};

pub const NAME: &str = "m20261201_000001_baseline";

/// The default secret kinds, in the order they are seeded (docs/accounts.md, 「Secret kinds」).
const SECRET_KINDS: &[KindSeed] = &[
  ("api-key", &[FieldSeed("API_KEY", MASKED, SecretInput::Line, REQUIRED)]),
  (
    "account-login",
    &[
      FieldSeed("USERNAME", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("PASSWORD", MASKED, SecretInput::Line, REQUIRED),
    ],
  ),
  (
    "aws-access-key",
    &[
      FieldSeed("AWS_ACCESS_KEY_ID", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("AWS_SECRET_ACCESS_KEY", MASKED, SecretInput::Line, REQUIRED),
      FieldSeed("AWS_REGION", SHOWN, SecretInput::Line, OPTIONAL),
    ],
  ),
  (
    "oauth-client",
    &[
      FieldSeed("CLIENT_ID", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("CLIENT_SECRET", MASKED, SecretInput::Line, REQUIRED),
    ],
  ),
  (
    "database",
    &[
      FieldSeed("DB_HOST", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("DB_PORT", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("DB_USER", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("DB_PASSWORD", MASKED, SecretInput::Line, REQUIRED),
      FieldSeed("DB_NAME", SHOWN, SecretInput::Line, REQUIRED),
    ],
  ),
  ("ssh-private-key", &[FieldSeed("SSH_PRIVATE_KEY", MASKED, SecretInput::Lines, REQUIRED)]),
  ("file", &[FieldSeed("FILE", SHOWN, SecretInput::File, REQUIRED)]),
  (
    "card",
    &[
      FieldSeed("CARD_NUMBER", MASKED, SecretInput::Line, REQUIRED),
      FieldSeed("CARD_EXPIRY", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("CARD_CVC", MASKED, SecretInput::Line, REQUIRED),
      FieldSeed("CARD_HOLDER_NAME", SHOWN, SecretInput::Line, REQUIRED),
    ],
  ),
  (
    "delivery-address",
    &[
      FieldSeed("RECIPIENT", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("PHONE", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("POSTAL_CODE", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("ADDRESS", SHOWN, SecretInput::Line, REQUIRED),
      FieldSeed("ADDRESS_DETAIL", SHOWN, SecretInput::Line, OPTIONAL),
    ],
  ),
];

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    NAME
  }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(include_str!("baseline.sql")).await?;

    seed(manager, SECRET_KINDS).await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(include_str!("baseline.down.sql")).await?;

    Ok(())
  }
}
