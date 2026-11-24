//! The bodies of the platform administrator's permanent delete (`docs/accounts.md`, 「Deleting an account for
//! good」, 「Deleting a unit or a company」 and 「The removal record」): what a removal would take, what it took,
//! and the record it leaves.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::types::UnitRef;

/// Each kind of row a removal counts or removes, by its kebab-case English plural, and how many.
pub type RemovalCounts = BTreeMap<String, i64>;

/// What removing an account would take now: who it is, whether it has left, the refusal that would stop it, or
/// none, and the count of each kind of row the service would delete.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AccountRemoval {
  pub user: String,
  pub name: String,
  #[serde(rename = "fullName", default)]
  pub full_name: String,
  pub left: bool,
  pub administrator: bool,
  pub refusal: Option<String>,
  pub counts: RemovalCounts,
}

/// A person whose home unit stands in a unit's subtree, as a unit's removal names them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RemovalPerson {
  pub user: String,
  pub name: String,
  pub left: bool,
  pub administrator: bool,
}

/// What removing a unit and every unit under it would take now: the subtree the deepest first, the people standing
/// in it, the refusal that would stop it, or none, and the count of each kind of row the service would delete.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitRemoval {
  pub unit: i64,
  pub name: String,
  pub company: i64,
  pub units: Vec<UnitRef>,
  pub people: Vec<RemovalPerson>,
  pub refusal: Option<String>,
  pub counts: RemovalCounts,
}

/// A removal asked: what every content unit removed before it, by the unit's name, which the record keeps.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RemovalAsk {
  #[serde(default)]
  pub units: BTreeMap<String, RemovalCounts>,
}

/// What a removal took here, and the record it left.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Removed {
  pub removed: RemovalCounts,
  pub record: i64,
}

/// One removal as its record keeps it: what went, an account or a unit, its id, its login and name as they stood,
/// who removed it and when, and every unit's result, the service's own under `web`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RemovalRecord {
  pub id: i64,
  pub what: String,
  pub subject: i64,
  pub login: String,
  pub name: String,
  pub by: Option<String>,
  pub at: i64,
  pub result: BTreeMap<String, RemovalCounts>,
}

/// The removal records, the newest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Removals {
  pub removals: Vec<RemovalRecord>,
}
