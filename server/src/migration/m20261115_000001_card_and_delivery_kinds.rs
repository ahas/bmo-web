//! The card and delivery-address secret kinds (docs/accounts.md, 「Secret kinds」), seeded once after the kinds
//! that stand, so a deployment made before them gains both and a fresh one holds them after the first defaults.

use bmo_web_client::SecretInput;
use sea_orm_migration::prelude::*;

use super::secret_kind_seeds::{FieldSeed, KindSeed, MASKED, OPTIONAL, REQUIRED, SHOWN, seed};

pub struct Migration;

impl MigrationName for Migration {
  fn name(&self) -> &str {
    "m20261115_000001_card_and_delivery_kinds"
  }
}

/// The kinds this migration seeds, in their order.
const SEEDS: &[KindSeed] = &[
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

#[async_trait::async_trait]
impl MigrationTrait for Migration {
  async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
    seed(manager, SEEDS).await
  }

  /// Nothing is taken back: a kind standing under either key may be the owner's own by now.
  async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
    Ok(())
  }
}
