//! The agents and their settings as `bmo agent` tells them (docs/agent-control.md), each line with the
//! `{name}` marks its file names.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentsWords {
  pub provider_order: String,
  pub provider_unknown: String,
  pub key_usable: String,
  pub key_none: String,
  pub key_unusable: String,
  pub on_off: String,
  pub heal_on_off: String,
  pub no_account: String,
  pub credential_kind: String,
  pub no_worker: String,
  pub back_here_path: String,
  pub nothing_to_change: String,
  pub pre_gate: String,
  pub post_gate: String,
  pub node_checkout: NodeCheckoutWords,
  pub node_placing: NodePlacingWords,
}

/// Why a base cannot have its checkout on a node, or lose it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodeCheckoutWords {
  pub not_base: String,
  pub base_on_node: String,
  pub already: String,
  pub name_long: String,
  pub name_taken: String,
  pub path: String,
  pub missing: String,
  pub busy: String,
  pub not_removed: String,
}

/// Why a worker cannot stand on a node.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodePlacingWords {
  pub no_node: String,
  pub no_jobs: String,
  pub builtin: String,
  pub support: String,
  pub has_support: String,
  pub path: String,
}

crate::part!(pub AGENTS: AgentsWords = "agents");
