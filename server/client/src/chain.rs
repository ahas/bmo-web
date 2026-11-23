//! The delegation chain's bodies (`docs/boundary.md`, 「The delegation chain」): a setting kind as the unit using it
//! declares it, a link's entry, a group of people, and a setting resolved for a person or a unit.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The shape a kind's value takes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ChainShape {
  /// `true` or `false`.
  Flag,
  /// A string.
  Text,
  /// `"unlimited"` or a whole number of zero or more.
  Amount,
  /// Distinct keys out of the kind's choices, in an order.
  Keys,
  /// An object or a list the consumer judges.
  Json,
}

/// How the links' words make one answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ChainMode {
  /// The nearest link's word stands.
  Nearest,
  /// Every link narrows what the links above it say.
  Narrowing,
  /// Every link's word, top first, for the consumer to compose.
  Layered,
}

/// A level of the chain a kind may hold an entry at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ChainLevel {
  Platform,
  Unit,
  Person,
}

/// Whether the links below a link may change a setting.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ChainDelegation {
  /// The links below may change it.
  Allow,
  /// No link below changes it.
  Lock,
  /// The link follows the link above.
  #[default]
  Inherit,
}

impl ChainDelegation {
  /// The word the delegation is stored and sent as.
  pub fn key(self) -> &'static str {
    match self {
      ChainDelegation::Allow => "allow",
      ChainDelegation::Lock => "lock",
      ChainDelegation::Inherit => "inherit",
    }
  }

  /// The delegation a stored word names, none for any other.
  pub fn parse(key: &str) -> Option<Self> {
    match key {
      "allow" => Some(ChainDelegation::Allow),
      "lock" => Some(ChainDelegation::Lock),
      "inherit" => Some(ChainDelegation::Inherit),
      _ => None,
    }
  }
}

/// Who writes a person's link.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ChainPersonWriter {
  /// Whoever holds the kind's unit permission on the person's home unit, the platform administrator among them.
  #[default]
  Heads,
  /// The person alone.
  #[serde(rename = "self")]
  Own,
  /// Either.
  Both,
}

fn manage() -> String {
  "manage".to_owned()
}

/// A setting kind, as the unit using it declares it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChainKind {
  pub key: String,
  /// The unit that declared it.
  pub declared_by: String,
  #[serde(default)]
  pub description: String,
  pub shape: ChainShape,
  /// The keys a `keys` value is chosen from.
  #[serde(default)]
  pub choices: Vec<String>,
  pub mode: ChainMode,
  /// The value standing where no link says one.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub default: Option<Value>,
  /// Whether a link may set the value apart for a person, a group or a unit.
  #[serde(default)]
  pub rules: bool,
  pub levels: Vec<ChainLevel>,
  /// The sumida organisation permission that lets a person write a unit's link.
  #[serde(default = "manage")]
  pub unit_permission: String,
  #[serde(default)]
  pub person_writer: ChainPersonWriter,
}

/// Every kind declared.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ChainKinds {
  pub kinds: Vec<ChainKind>,
}

/// One rule of a link: whom it names (`person:<user>`, `group:<id>` or `unit:<id>`) and its value.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ChainRule {
  pub who: String,
  pub value: Value,
}

/// A link's entry of one kind.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChainEntry {
  pub kind: String,
  /// `platform`, `unit:<id>` or `person:<user>`.
  pub link: String,
  /// The link's own value, none where it follows above.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub value: Option<Value>,
  pub delegation: ChainDelegation,
  #[serde(default)]
  pub rules: Vec<ChainRule>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub set_by: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub set_at: Option<i64>,
  /// The farthest link above holding a lock, where one does: nothing here changes then.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub locked_by: Option<String>,
  /// Whether the caller may change the entry now.
  pub writable: bool,
}

/// A link's value written, null to follow above.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ChainValueAsk {
  #[serde(default)]
  pub value: Option<Value>,
}

/// A link's delegation written.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ChainDelegationAsk {
  pub delegation: ChainDelegation,
}

/// A link's rules written whole.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ChainRulesAsk {
  pub rules: Vec<ChainRule>,
}

/// One link's word for a subject: its value, and whom the rule it came from names where one did.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct ChainLayer {
  pub link: String,
  pub value: Value,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub rule: Option<String>,
}

/// Whether a link asked after may change a setting, and the link whose lock withholds it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChainLinkStanding {
  pub link: String,
  pub may_change: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub locked_by: Option<String>,
}

/// A setting resolved for a person or a unit (docs/accounts.md, 「Resolution」).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChainResolution {
  pub kind: String,
  /// `person:<user>` or `unit:<id>`.
  pub subject: String,
  /// The value standing; none for a layered kind, and where nothing is said and no default stands.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub value: Option<Value>,
  /// The link the value came from; none where the default stands or the kind narrows.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub from: Option<String>,
  /// Whom the rule the value came from names, where a rule gave it.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub rule: Option<String>,
  /// Every link's word for the subject, top first, below the lock that cut the chain left out.
  pub layers: Vec<ChainLayer>,
  /// Every link of the subject's chain, top first, whether or not it says anything: the platform, each unit down
  /// to the subject's and, for a person, the person.
  #[serde(default)]
  pub path: Vec<String>,
  /// The link whose lock cut the chain.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub locked_by: Option<String>,
  /// The link asked after.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub link: Option<ChainLinkStanding>,
}

/// What a resolution is asked for: a person or a unit, and a link to ask after.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ChainResolveAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub person: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub unit: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub link: Option<String>,
}

/// A named group of people a unit keeps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ChainGroup {
  pub id: i64,
  pub unit: i64,
  pub name: String,
  /// The members' user ids.
  pub members: Vec<String>,
}

/// The groups a unit keeps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ChainGroups {
  pub groups: Vec<ChainGroup>,
}

/// A group made or changed: its unit on a make, its name and its members whole.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ChainGroupAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub unit: Option<i64>,
  pub name: String,
  pub members: Vec<String>,
}

/// The unit a groups read is asked for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ChainGroupsAsk {
  pub unit: i64,
}
