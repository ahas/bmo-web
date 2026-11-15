//! How a migration seeds default secret kinds (docs/accounts.md, 「Secret kinds」): each kind's key and its fields'
//! shapes are the migration's, their words the server's pack's. A kind goes after every kind that stands, and one
//! already standing under its key is left as it stands, so the owner's change or removal is never undone.

use bmo_web_client::{SecretField, SecretInput};
use sea_orm_migration::prelude::*;

use crate::lang::secret_kinds::SECRET_KINDS;

/// One field a default kind is seeded with: its key, whether it is masked, how it is typed and whether it is
/// required. Its label is the pack's.
pub struct FieldSeed(pub &'static str, pub bool, pub SecretInput, pub bool);

pub const MASKED: bool = true;
pub const SHOWN: bool = false;
pub const REQUIRED: bool = true;
pub const OPTIONAL: bool = false;

/// A default kind: its key and its fields, in their order.
pub type KindSeed = (&'static str, &'static [FieldSeed]);

const SEED: &str = r#"INSERT INTO "secret_kinds" ("key", "name", "description", "fields", "position", "updated_at")
  SELECT $1, $2, $3, $4::jsonb, COALESCE(MAX("position"), 0) + 1, $5 FROM "secret_kinds"
  ON CONFLICT ("key") DO NOTHING"#;

/// The kinds `seeds` names, each after every kind standing as it goes in, in the order given.
pub async fn seed(manager: &SchemaManager<'_>, seeds: &[KindSeed]) -> Result<(), DbErr> {
  let db = manager.get_connection();
  let now = crate::now_ms();

  for (key, fields) in seeds {
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
        now.into(),
      ],
    ))
    .await?;
  }

  Ok(())
}
