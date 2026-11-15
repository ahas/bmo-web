//! The secret kinds (docs/accounts.md, 「Secret kinds」, 「The tables」): the shapes the console's secret form asks
//! a value in, never a value, each kept with the order kinds were added in. The table is made with the first
//! defaults, seeded once as every default kind is (`secret_kind_seeds`).

use bmo_web_client::SecretInput;
use sea_orm_migration::prelude::*;

use super::secret_kind_seeds::{FieldSeed, KindSeed, MASKED, OPTIONAL, REQUIRED, SHOWN, seed};

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261112_000001_secret_kinds"
  }
}

pub const SECRET_KINDS_TABLE: &str = r#"
CREATE TABLE IF NOT EXISTS "secret_kinds" (
  "key" text PRIMARY KEY,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "fields" jsonb NOT NULL,
  "position" bigint NOT NULL,
  "updated_at" bigint NOT NULL
);
"#;

/// The first default kinds, in the order they are seeded.
const SEEDS: &[KindSeed] = &[
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
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager.get_connection().execute_unprepared(SECRET_KINDS_TABLE).await?;

    seed(manager, SEEDS).await
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "secret_kinds""#)
      .await?;

    Ok(())
  }
}
