//! The secret kinds (docs/accounts.md, 「Secret kinds」, 「The tables」): the shapes the console's secret form asks
//! a value in, never a value, each kept with the order kinds were added in. The defaults are seeded once, their
//! keys and fields' shapes here and their words from the server's pack; a kind that stands under a default's key
//! is left as it stands, so the owner's change or removal is never undone by a migration run again.

use bmo_web_client::{SecretField, SecretInput};
use sea_orm_migration::prelude::*;

use crate::lang::secret_kinds::SECRET_KINDS;

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

/// One field a default kind is seeded with: its key, whether it is masked, how it is typed and whether it is
/// required. Its label is the pack's.
struct FieldSeed(&'static str, bool, SecretInput, bool);

const MASKED: bool = true;
const SHOWN: bool = false;
const REQUIRED: bool = true;
const OPTIONAL: bool = false;

/// The default kinds, in the order they are seeded, each with its fields. Their names, descriptions and labels
/// are the pack's.
const SEEDS: &[(&str, &[FieldSeed])] = &[
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

const SEED: &str = r#"INSERT INTO "secret_kinds" ("key", "name", "description", "fields", "position", "updated_at")
  VALUES ($1, $2, $3, $4::jsonb, $5, $6)
  ON CONFLICT ("key") DO NOTHING"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    let db = manager.get_connection();

    db.execute_unprepared(SECRET_KINDS_TABLE).await?;

    let now = crate::now_ms();

    for (position, (key, fields)) in (1_i64..).zip(SEEDS) {
      let words = SECRET_KINDS.kind(key);
      let fields: Vec<SecretField> = fields
        .iter()
        .map(|FieldSeed(field, masked, input, required)| SecretField {
          key: (*field).to_owned(),
          label: words.label(field).to_owned(),
          masked: *masked,
          input: *input,
          required: *required,
        })
        .collect();
      let fields = serde_json::to_string(&fields).map_err(|why| DbErr::Custom(why.to_string()))?;

      db.execute(crate::store::statement(
        SEED,
        vec![
          (*key).into(),
          words.name.clone().into(),
          words.description.clone().into(),
          fields.into(),
          position.into(),
          now.into(),
        ],
      ))
      .await?;
    }

    Ok(())
  }

  async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
      .get_connection()
      .execute_unprepared(r#"DROP TABLE IF EXISTS "secret_kinds""#)
      .await?;

    Ok(())
  }
}
