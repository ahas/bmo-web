//! The words of the secret kinds the migration seeds (`lang/<language>/secret-kinds.yaml`): each kind's name and
//! description and each field's label, by the kind's key and the field's key in lower snake case.

use indexmap::IndexMap;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SecretKinds {
  /// Each seeded kind's words, by its key in lower snake case.
  pub kinds: IndexMap<String, KindWords>,
}

/// What a person reads of one kind.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KindWords {
  pub name: String,
  pub description: String,
  /// Each field's label, by the field's key in lower snake case.
  pub fields: IndexMap<String, String>,
}

/// A kind's or a field's key as the part writes it: in lower snake case.
pub fn pack_key(key: &str) -> String {
  key.to_ascii_lowercase().replace('-', "_")
}

impl SecretKinds {
  /// The words of the kind `key` names. A seeded kind the part holds no words for is a fault of the build, which
  /// the pack's own test meets first.
  pub fn kind(&self, key: &str) -> &KindWords {
    self
      .kinds
      .get(&pack_key(key))
      .unwrap_or_else(|| panic!("the language pack's secret-kinds holds no kind `{key}`"))
  }
}

impl KindWords {
  /// The label of the field `key` names, a fault of the build where the part holds none.
  pub fn label(&self, key: &str) -> &str {
    self
      .fields
      .get(&pack_key(key))
      .unwrap_or_else(|| panic!("the language pack's secret-kinds holds no field `{key}`"))
  }
}

crate::part!(pub SECRET_KINDS: SecretKinds = "secret-kinds");
