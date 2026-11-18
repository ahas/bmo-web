//! The bodies of a company's own words for its organisation and of what stands on its units beside heads and
//! members (`docs/accounts.md`, 「Roles and unit kinds」, 「Concurrent posts」, 「Acting」, 「The line of a unit」 and
//! 「A person's history」): the role and kind catalogues, a unit as it is read whole, a unit's line, a person's
//! posts and the changes of their place.

use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};

use crate::types::{Unit, UnitRef};

/// A field that tells absent from null: absent reads as none, null as some none, a value as some value.
pub fn absent_or_null<'de, D, T>(reader: D) -> Result<Option<Option<T>>, D::Error>
where
  D: Deserializer<'de>,
  T: Deserialize<'de>,
{
  Option::<T>::deserialize(reader).map(Some)
}

/// One role of a company's catalogue: its key, its name and its place, counted from 1 for the lowest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoleRef {
  pub key: String,
  pub name: String,
  pub place: i32,
}

/// One unit kind of a company's list: its key and its name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct KindRef {
  pub key: String,
  pub name: String,
}

/// One entry of a catalogue as it is written: its key and its name, its place being where the list stands it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CatalogueEntry {
  pub key: String,
  pub name: String,
}

/// A company's roles, lowest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CompanyRoles {
  pub roles: Vec<RoleRef>,
}

/// A company's roles written whole, lowest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CompanyRolesAsk {
  pub roles: Vec<CatalogueEntry>,
}

/// A company's unit kinds, in its order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitKinds {
  pub kinds: Vec<KindRef>,
}

/// A company's unit kinds written whole, in its order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitKindsAsk {
  pub kinds: Vec<CatalogueEntry>,
}

/// A person of a unit's members carrying a role there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MemberRole {
  pub user: String,
  pub role: RoleRef,
}

/// A person holding a post in a unit: the post's role and whether it carries the unit's head.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ConcurrentPost {
  pub user: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<RoleRef>,
  pub head: bool,
}

/// An acting appointment running: who acts, until when, who named them and when.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Appointment {
  pub user: String,
  pub until: i64,
  pub by: Option<String>,
  pub at: i64,
}

/// An acting appointment asked: the person and the moment it ends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AppointmentAsk {
  pub user: String,
  pub until: i64,
}

/// One organisation unit read whole: what `Unit` answers, and beside it the unit's kind, short name and the unit
/// it reports to, the members whose accounts have left, the roles its people carry, the people holding a post in it
/// and the appointment running.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UnitView {
  #[serde(flatten)]
  pub unit: Unit,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<KindRef>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub short_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub reports_to: Option<UnitRef>,
  /// The members whose accounts have left.
  #[serde(default)]
  pub left: Vec<String>,
  pub roles: Vec<MemberRole>,
  pub concurrent: Vec<ConcurrentPost>,
  pub acting: Option<Appointment>,
}

/// How a step of a line was reached from the one before it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum LineVia {
  /// The unit the line is read for.
  Start,
  /// The unit the step before reports to.
  ReportsTo,
  /// The parent of the step before.
  Parent,
}

/// A head of a step of a line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LineHead {
  pub user: String,
  pub name: String,
  /// Whether the grant is an acting appointment's.
  pub acting: bool,
  /// Whether they head it through a post.
  pub concurrent: bool,
}

/// A person holding a role at a step of a line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LineHolder {
  pub user: String,
  pub name: String,
  /// Whether they hold it through a post.
  pub concurrent: bool,
}

/// One role at a step of a line and the people holding it there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct LineRole {
  pub role: RoleRef,
  pub holders: Vec<LineHolder>,
}

/// One step of a unit's line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LineStep {
  pub unit: UnitRef,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<KindRef>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub short_name: Option<String>,
  pub via: LineVia,
  pub heads: Vec<LineHead>,
  pub roles: Vec<LineRole>,
}

/// A unit's line, the unit first and its company last.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitLine {
  pub steps: Vec<LineStep>,
}

/// A person standing for a role for a unit: where they hold it and whether through a post.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoleHolder {
  pub user: String,
  pub name: String,
  pub unit: UnitRef,
  pub concurrent: bool,
}

/// Why the people standing for a role hold another one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum StandReason {
  /// Nobody on the line holds the role asked, so the holders of the next lower role found stand for it.
  NoHolder,
}

/// Who stands for one role for a unit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoleStand {
  /// The role asked.
  pub role: RoleRef,
  pub holders: Vec<RoleHolder>,
  /// The role the holders hold; none where nobody stands.
  pub standing: Option<RoleRef>,
  /// Whether the holders hold a lower role than the one asked.
  pub acting: bool,
  pub reason: Option<StandReason>,
}

/// One post of a person: its unit and path, its role, whether it carries the unit's head, and when and by whom
/// it was given.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Post {
  pub unit: UnitRef,
  pub path: Vec<UnitRef>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<RoleRef>,
  pub head: bool,
  pub since: i64,
  pub by: Option<String>,
}

/// A person's posts, in the order of their units' paths.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Posts {
  pub posts: Vec<Post>,
}

/// A post given: its role by key, null for none, and whether it carries the unit's head.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PostAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<String>,
  #[serde(default)]
  pub head: bool,
}

/// An appointment of a person's running: the unit they act for and until when.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ActingFor {
  pub unit: UnitRef,
  pub until: i64,
}

/// What one change of a person's place was.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum HistoryChange {
  Placed,
  Role,
  HeadGranted,
  HeadTaken,
  Acting,
  ActingEnded,
  PostGiven,
  PostChanged,
  PostTaken,
  Left,
}

/// A role as a change of a person's place kept it: its key and the name it had then.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoleMark {
  pub key: String,
  pub name: String,
}

/// One change of a person's place.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
  pub at: i64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub by: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub by_name: Option<String>,
  pub change: HistoryChange,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub unit: Option<UnitRef>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub from: Option<UnitRef>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub before: Option<RoleMark>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub after: Option<RoleMark>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub until: Option<i64>,
}
