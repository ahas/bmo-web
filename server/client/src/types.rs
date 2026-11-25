//! Every body and member the account service's routes carry (`docs/boundary.md`, 「What the server serves」).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::organisation::{ActingFor, HistoryEntry, KindRef, Post, RoleRef, absent_or_null};

/// Whether the service is up, its version, and whether the account model is in force.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Health {
  pub ok: bool,
  pub version: String,
  pub in_force: bool,
}

/// Where the account model stands, and why it is not in force where it is not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelState {
  pub in_force: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub why: Option<String>,
}

/// What the data move is handed: the senders the deployment's configuration names as the owner's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveAsk {
  pub owner_senders: Vec<i64>,
}

/// What the data move answered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Moved {
  pub done: bool,
  pub written: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub administrator: Option<String>,
}

/// The user a sender is linked to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SenderUser {
  pub user: String,
}

/// The senders a caller asks after, each by its number.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SendersAsk {
  pub senders: Vec<i64>,
}

/// One sender linked to a user, and whether that user may sign in to the console.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SenderLink {
  pub sender: i64,
  pub user: String,
  pub signs_in: bool,
}

/// The senders asked after that are linked to a user, in the order they were asked; a sender linked to none is
/// absent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SenderLinks {
  pub links: Vec<SenderLink>,
}

/// A user as the console reads them: their login as `name`, and the person's name people read them by as
/// `fullName`, empty where none stands (docs/accounts.md, 「Users and senders」).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UserView {
  pub user: String,
  pub name: String,
  #[serde(rename = "fullName", default)]
  pub full_name: String,
  pub administrator: bool,
  pub senders: Vec<i64>,
}

/// One user as the users list names them: their id, their login, the person's name (empty where none stands)
/// and whether they are the platform administrator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UserSummary {
  pub user: String,
  pub name: String,
  #[serde(rename = "fullName", default)]
  pub full_name: String,
  pub administrator: bool,
}

/// Every user, for the administrator's screen that sets one person's sections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UserList {
  pub users: Vec<UserSummary>,
}

/// One console section's permission for a user: whether they may read it and whether they may write it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SectionRow {
  pub section: String,
  pub read: bool,
  pub write: bool,
}

/// One person of the reader's organisation in the console's directory (docs/accounts.md, 「The people
/// directory」). The contact fields stand only for the platform administrator and for the person themselves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Person {
  pub user: String,
  pub name: String,
  pub organization: String,
  /// The title as one line: composed from the rank and the role where either is set, the job title kept
  /// otherwise.
  pub job_title: String,
  /// The rank kept, empty where none is.
  #[serde(default)]
  pub rank: String,
  /// The role carried in the home unit.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<RoleRef>,
  /// The duty kept, empty where none is.
  #[serde(default)]
  pub duty: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub landline: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub mobile: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub email: Option<String>,
}

/// One post of a person as the directory answers it: the unit by its reference and the post's role.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PersonPost {
  pub unit: UnitRef,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<RoleRef>,
}

/// One person of the directory looked up: what a search row answers, and their posts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PersonDetail {
  #[serde(flatten)]
  pub person: Person,
  pub posts: Vec<PersonPost>,
}

/// The people a search found, in the organisation's own order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct People {
  pub people: Vec<Person>,
}

/// One member of the reader's company as a picker finds and shows them (docs/accounts.md, 「The people
/// directory」): the account key and the name, nothing more.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Member {
  pub user: String,
  pub name: String,
}

/// Every member of the reader's company who has not left, in the directory's order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Members {
  pub members: Vec<Member>,
}

/// The companies the reader looks through in the people roster (docs/accounts.md, 「The people roster」), in
/// name order; empty for a reader who looks through none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RosterCompanies {
  pub companies: Vec<UnitRef>,
}

/// Where an account stands in the people roster: in use, made by an invitation and not yet enabled, or
/// marked left.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum RosterState {
  Active,
  Pending,
  Left,
}

/// One person as a page of the people roster answers them (docs/accounts.md, 「The people roster」).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RosterPerson {
  pub user: String,
  pub login: String,
  /// The person's name, the login where none stands.
  pub name: String,
  pub company: UnitRef,
  pub unit: UnitRef,
  /// Whether they are granted head of the unit they stand in.
  pub head: bool,
  /// Whether that grant is an acting appointment's.
  #[serde(default)]
  pub acting: bool,
  /// Whether they are the platform administrator.
  pub administrator: bool,
  pub state: RosterState,
  /// The machine the account is bound to, by its name; none where it is bound to none.
  pub machine: Option<String>,
  /// When the account was made.
  pub made_at: i64,
  /// When the user last signed in; none where they never have since the service kept it.
  pub last_sign_in_at: Option<i64>,
  /// The title as one line, empty where nothing is kept.
  pub job_title: String,
  #[serde(default)]
  pub rank: String,
  /// The role carried in the home unit.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<RoleRef>,
  #[serde(default)]
  pub duty: String,
  /// The unit of the post through which they count in a page narrowed by unit or kind, where their home unit
  /// does not match it.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub post: Option<UnitRef>,
  /// The email, for the administrator alone.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub email: Option<String>,
}

/// One page of the people roster: its people, how many people match the whole ask, and the place to ask the
/// next page from in `after`, none where nothing stands past it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RosterPage {
  pub people: Vec<RosterPerson>,
  pub total: i64,
  pub next: Option<String>,
}

/// When a person in the roster left, and who marked it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RosterLeft {
  pub at: i64,
  /// The user who marked it.
  pub by: String,
  /// That user's name, the login where none stands.
  pub by_name: String,
}

/// The machine a person in the roster is bound to: its name, whether it is shared, when it was last proven.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RosterMachine {
  pub name: String,
  pub shared: bool,
  pub proven_at: Option<i64>,
}

/// One person of the people roster opened (docs/accounts.md, 「The people roster」): what a page answers
/// of them, with their landline and mobile for the administrator alone, their unit's path from the company
/// down, the units they are granted head of directly, their departure and their machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RosterDetail {
  #[serde(flatten)]
  pub person: RosterPerson,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub landline: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub mobile: Option<String>,
  pub path: Vec<UnitRef>,
  pub head_of: Vec<UnitRef>,
  /// The appointments of theirs running.
  pub acting_for: Vec<ActingFor>,
  pub posts: Vec<Post>,
  /// Every change of their place kept, the newest first.
  pub history: Vec<HistoryEntry>,
  pub left: Option<RosterLeft>,
  pub machine_standing: Option<RosterMachine>,
}

/// What a page of the people roster is asked for; every field absent asks for everyone, the first page
/// and 50 people.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RosterAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub q: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub company: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub unit: Option<i64>,
  /// A kind's key.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<String>,
  /// `head` or `member`.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub role: Option<String>,
  /// `active`, `pending` or `left`.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub state: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub after: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub limit: Option<i64>,
}

/// A user's sections, in the console's navigation order; every write is also a read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Sections {
  pub sections: Vec<SectionRow>,
}

/// A user's person's name, job title, rank, duty and contact details, which the account's holder or an
/// administrator keeps (docs/accounts.md, 「Users and senders」). Every field is a string, empty where the account
/// keeps none.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
  pub full_name: String,
  /// The job title kept, as free text.
  pub job_title: String,
  #[serde(default)]
  pub rank: String,
  #[serde(default)]
  pub duty: String,
  pub landline: String,
  pub mobile: String,
  pub email: String,
}

/// A user's profile written: the name, the job title and the contact details whole, and the rank and the duty
/// where named, each left as it stands where absent.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAsk {
  pub full_name: String,
  pub job_title: String,
  pub landline: String,
  pub mobile: String,
  pub email: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub rank: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub duty: Option<String>,
}

/// A company's default for its people's BMOs (docs/accounts.md, 「A person's BMO profile」): its name, the names
/// that call it and whether it keeps a picture. A name absent and no call names are none set.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompanyAgent {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  pub call_names: Vec<String>,
  pub picture: bool,
}

/// A company's default name and call names, replaced whole; an empty name is none.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompanyAgentAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default)]
  pub call_names: Vec<String>,
}

/// A person's own name, call names and persona for their BMO, replaced whole; an empty name or persona is none.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OwnAgentAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default)]
  pub call_names: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub persona: Option<String>,
}

/// Where a part of a person's BMO profile came from: their own, their company's default, or the deployment's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum AgentSource {
  Own,
  Company,
  Deployment,
}

/// The name standing for a person's BMO and where it came from; absent where the deployment's stands, for the
/// console's language pack to say.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentName {
  pub from: AgentSource,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
}

/// The names that call a person's BMO and where they came from; none where the deployment's stand.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentCallNames {
  pub from: AgentSource,
  pub call_names: Vec<String>,
}

/// The persona standing for a person's BMO and where it came from; absent where the deployment's stands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentPersona {
  pub from: AgentSource,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub persona: Option<String>,
}

/// Where the picture standing for a person's BMO came from; its bytes are `GET /users/{user}/agent/picture`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentPicture {
  pub from: AgentSource,
}

/// A person's own parts as kept, whether or not they may use them; `picture` says whether one is kept.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OwnAgent {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  pub call_names: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub persona: Option<String>,
  pub picture: bool,
}

/// The BMO profile standing for a person (docs/accounts.md, 「A person's BMO profile」): whether they may
/// personalise it, their company, each part with where it came from, and their own parts as kept.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
  pub personalize: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub company: Option<UnitRef>,
  pub name: AgentName,
  pub call_names: AgentCallNames,
  pub persona: AgentPersona,
  pub picture: AgentPicture,
  pub own: OwnAgent,
}

/// The permission to personalise one's BMO as set on a unit or a person: allowed, denied, or following the unit
/// above, which is no setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum AgentSetting {
  Allow,
  Deny,
  Inherit,
}

/// A setting of the permission to personalise one's BMO.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentPermissionAsk {
  pub setting: AgentSetting,
}

/// One unit under a unit's permissions: where it stands, its own setting and what it resolves to for a person
/// standing in it with none of their own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentPermissionUnit {
  pub id: i64,
  pub name: String,
  /// The unit it stands under, absent for a company.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
  pub setting: AgentSetting,
  pub allowed: bool,
}

/// One person under a unit's permissions: the unit they stand in, their own setting and what it resolves to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentPermissionPerson {
  pub user: String,
  /// The person's name, the login where none stands.
  pub name: String,
  pub unit: i64,
  pub setting: AgentSetting,
  pub allowed: bool,
}

/// The permission to personalise one's BMO across a unit: the unit and every unit below it, each after its
/// parent, and every person standing in one of them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentPermissions {
  pub units: Vec<AgentPermissionUnit>,
  pub people: Vec<AgentPermissionPerson>,
}

/// The rooms the console has open, as the receiver reads them, and when the console last said so.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Watching {
  pub rooms: Vec<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub at: Option<i64>,
}

/// The rooms a console reports open.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct WatchingAsk {
  pub rooms: Vec<i64>,
}

/// A secret the store holds, by its name: its size and when it last changed, never its value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Secret {
  pub name: String,
  pub bytes: i64,
  pub changed_at: i64,
  /// The kind its file reads as, by the kind's key, where the store's list reads one; absent elsewhere.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<String>,
}

/// Every secret the store holds, in the order of their names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Secrets {
  pub secrets: Vec<Secret>,
}

/// How a secret's `value` carries its bytes: as its own UTF-8 text, or as base64 under the standard alphabet,
/// so a file that is not text reaches the store unchanged.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SecretEncoding {
  #[default]
  Text,
  Base64,
}

/// A value written under a name, replacing the one the name holds only where `replace` says so; `encoding` says
/// how the value carries its bytes, text where it is absent.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SecretAsk {
  pub value: String,
  #[serde(default)]
  pub replace: bool,
  #[serde(default)]
  pub encoding: SecretEncoding,
}

// The value never reaches a log line through a debug print.
impl std::fmt::Debug for SecretAsk {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter
      .debug_struct("SecretAsk")
      .field("value", &format_args!("({} bytes)", self.value.len()))
      .field("replace", &self.replace)
      .field("encoding", &self.encoding)
      .finish()
  }
}

/// How a secret kind's field is typed: one line, several lines, or a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SecretInput {
  Line,
  Lines,
  File,
}

/// One field of a secret kind: the key its line is written under in the file, the label a person reads,
/// whether its value is masked as it is typed, how it is typed, and whether it is required.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SecretField {
  pub key: String,
  pub label: String,
  pub masked: bool,
  pub input: SecretInput,
  pub required: bool,
}

/// A shape the console's secret form asks a value in, never a value (docs/accounts.md, 「Secret kinds」).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SecretKind {
  pub key: String,
  pub name: String,
  pub description: String,
  pub fields: Vec<SecretField>,
}

/// Every secret kind, in the order they were added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SecretKinds {
  pub kinds: Vec<SecretKind>,
}

/// The senders linked to a user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Senders {
  pub senders: Vec<i64>,
}

/// A password change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PasswordAsk {
  pub current: String,
  pub next: String,
}

/// A new name for a user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NameAsk {
  pub name: String,
}

/// Whether a user heads a unit, asked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitCheckAsk {
  pub unit: i64,
  pub user: String,
}

/// Whether one user may let another into a room, or take them out of it, asked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EntryCheckAsk {
  pub room: i64,
  /// The user acting.
  pub actor: String,
  /// The user let in or taken out.
  pub user: String,
}

/// One organisation unit as another names it: its number and its name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitRef {
  pub id: i64,
  pub name: String,
}

/// The unit a user stands in, its company, and the units from the company down to it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UserUnit {
  pub user: String,
  pub unit: UnitRef,
  pub company: UnitRef,
  pub path: Vec<UnitRef>,
}

/// One organisation unit: where it stands, what stands directly under it, who heads it and who stands in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Unit {
  pub id: i64,
  pub name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
  pub company: UnitRef,
  pub path: Vec<UnitRef>,
  pub children: Vec<UnitRef>,
  pub heads: Vec<String>,
  pub members: Vec<String>,
}

/// One unit of the whole tree, as the administrator reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitRow {
  pub id: i64,
  pub name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
  pub heads: Vec<String>,
  pub members: Vec<String>,
  /// The members whose accounts have left.
  #[serde(default)]
  pub left: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<KindRef>,
  #[serde(rename = "shortName", default, skip_serializing_if = "Option::is_none")]
  pub short_name: Option<String>,
  /// The unit it reports to, by its number.
  #[serde(rename = "reportsTo", default, skip_serializing_if = "Option::is_none")]
  pub reports_to: Option<i64>,
  /// The users holding a post in it.
  #[serde(default)]
  pub concurrent: Vec<String>,
  /// The users among `heads` whose grant is an acting appointment's.
  #[serde(default)]
  pub acting: Vec<String>,
}

/// Every unit, companies first and each unit after its parent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Units {
  pub units: Vec<UnitRow>,
}

/// A unit to make: a company where it names no parent; its kind by key, its short name and the unit it reports
/// to where named.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NewUnit {
  pub name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<String>,
  #[serde(rename = "shortName", default, skip_serializing_if = "Option::is_none")]
  pub short_name: Option<String>,
  #[serde(rename = "reportsTo", default, skip_serializing_if = "Option::is_none")]
  pub reports_to: Option<i64>,
}

/// A unit renamed or moved under another parent of its company, its kind, short name and the unit it reports to
/// set: each of the last three left as it stands where absent and taken away where null.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitChange {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
  #[serde(default, deserialize_with = "absent_or_null", skip_serializing_if = "Option::is_none")]
  pub kind: Option<Option<String>>,
  #[serde(
    rename = "shortName",
    default,
    deserialize_with = "absent_or_null",
    skip_serializing_if = "Option::is_none"
  )]
  pub short_name: Option<Option<String>>,
  #[serde(
    rename = "reportsTo",
    default,
    deserialize_with = "absent_or_null",
    skip_serializing_if = "Option::is_none"
  )]
  pub reports_to: Option<Option<i64>>,
}

/// The unit a user is placed in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitPlacement {
  pub unit: i64,
}

/// One person of a move into a unit: the unit they stood in when the move was shown, and whether they head the
/// unit they go to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PersonMove {
  pub user: String,
  pub from: i64,
  pub head: bool,
  /// The role carried in the unit, by key: null for none, and where absent kept by a person who stays and none
  /// for one who comes.
  #[serde(default, deserialize_with = "absent_or_null", skip_serializing_if = "Option::is_none")]
  pub role: Option<Option<String>>,
}

/// Several people moved into one unit in one act.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PeopleMove {
  pub people: Vec<PersonMove>,
}

/// An invitation to make.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct InviteAsk {
  pub unit: i64,
  #[serde(default)]
  pub head: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub hours: Option<i64>,
  /// The person's name the account is made with, where the maker gives one.
  #[serde(rename = "fullName", default, skip_serializing_if = "Option::is_none")]
  pub full_name: Option<String>,
}

/// One invitation, as the one who made it reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Invite {
  pub token: String,
  pub unit: UnitRef,
  pub company: UnitRef,
  pub head: bool,
  /// The person's name the invitation was made for, empty where none was given.
  #[serde(default)]
  pub full_name: String,
  pub expires_at: i64,
}

/// The open invitations a login reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Invites {
  pub invites: Vec<Invite>,
}

/// One unit a login may invite into: its parent, absent for a company, and its company, itself for a company.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct InviteUnit {
  pub id: i64,
  pub name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
  pub company: UnitRef,
}

/// The units a login may invite into, companies first and each unit after its parent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct InviteUnits {
  pub units: Vec<InviteUnit>,
}

/// An invitation as its link shows it, to a person with no account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteView {
  pub unit: UnitRef,
  pub company: UnitRef,
  pub head: bool,
  /// The person's name the invitation was made for, empty where none was given.
  #[serde(default)]
  pub full_name: String,
  pub expires_at: i64,
  pub state: String,
}

/// The login and the password an invitation is accepted with, and the person's name, the invitation's where
/// it is absent or empty.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AcceptAsk {
  pub name: String,
  pub password: String,
  #[serde(rename = "fullName", default, skip_serializing_if = "Option::is_none")]
  pub full_name: Option<String>,
}

/// The one-line installs of a machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Installs {
  pub linux: String,
  pub windows: String,
}

/// An accepted invitation: the account made, its machine and how to install it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Accepted {
  pub user: String,
  pub agent: String,
  pub credential: String,
  pub hub_url: String,
  pub install: Installs,
}

/// Whether an invited account's machine is attached and the account enabled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Proof {
  pub active: bool,
  /// The account, where it is active.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub user: Option<String>,
}

/// How the agent the hub holds for a machine is connected: the desktop app's built-in agent, or one installed apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum MachineKind {
  Desktop,
  Installed,
}

/// The machine an account is bound to and whether it is attached.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserNode {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub agent: Option<String>,
  /// Whether the administrator bound it as a machine several accounts share.
  #[serde(default)]
  pub shared: bool,
  pub attached: bool,
  /// How the agent the hub holds is connected, while it holds one.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<MachineKind>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub proven_at: Option<i64>,
  /// When the account was connected to the machine, none where it was not recorded.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub bound_at: Option<i64>,
  /// Whether the account has left.
  #[serde(default)]
  pub left: bool,
}

/// The machine the administrator binds an account to.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NodeBinding {
  /// A machine of this name; where none is named, a fresh name made for the account.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub agent: Option<String>,
  /// Whether the machine is one several accounts share; a binding that does not say so is the account's alone.
  #[serde(default, skip_serializing_if = "std::ops::Not::not")]
  pub shared: bool,
}

/// The administrator's declaration that an account's machine is shared with other accounts, or no longer shared.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NodeSharing {
  pub shared: bool,
}

/// A machine name revoked at the hub: the name, and whether the hub sent a leave to a machine attached under it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MachineRevoked {
  pub agent: String,
  pub left: bool,
}

/// An account bound to another machine: the machine, how to install it, and whether the hub holds it already.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Rebound {
  pub agent: String,
  /// Whether the binding is to a machine several accounts share.
  pub shared: bool,
  pub credential: String,
  pub hub_url: String,
  pub install: Installs,
  pub attached: bool,
}

/// A desktop pairing asked: the id the app keeps, the code a person checks, when it closes, and how long the app
/// waits between reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PairingMade {
  pub pairing: String,
  pub code: String,
  pub expires_at: i64,
  pub poll_after_seconds: u32,
}

/// An approved desktop pairing as the app reads it, once: the machine, its credential and the hub it attaches to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PairingCredential {
  pub node: String,
  pub credential: String,
  pub hub_url: String,
}

/// A desktop pairing as a signed-in person reads it by its code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PairingView {
  pub code: String,
  pub expires_at: i64,
  /// `waiting`, `approved`, `refused` or `expired`.
  pub state: String,
  /// While it waits, the machine the reader's account is bound to; approved by the reader, the machine approved.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub machine: Option<String>,
}

/// A desktop pairing approved: the machine it was bound to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PairingApproved {
  pub machine: String,
}

/// An invited account's ask to share a machine another agent holds: the machine's name, and the account the asking
/// browser is signed in to, where it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ShareAsk {
  pub machine: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub owner: Option<String>,
}

/// A share asked or bound: the machine, `bound` or `asked`, and the accounts whose binding was declared shared as it
/// was bound, empty while it waits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ShareAnswer {
  pub machine: String,
  pub state: String,
  pub holders: Vec<String>,
}

/// An invited account's ask as the invitation reads it back: the machine, when it was asked, and whether it is
/// `asked`, `approved` or `refused`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareAskState {
  pub machine: String,
  pub asked_at: i64,
  pub state: String,
}

/// An account bound to a machine, as a share's decider reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareHolder {
  pub user: String,
  pub login: String,
  /// The person's name, empty where none is kept.
  pub full_name: String,
}

/// An ask waiting for a decision: the asking account, where it was invited, the machine and who is on it already.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareAskRow {
  pub user: String,
  pub login: String,
  /// The person's name, empty where none is kept.
  pub full_name: String,
  pub unit: UnitRef,
  pub company: UnitRef,
  pub machine: String,
  pub holders: Vec<ShareHolder>,
  pub asked_at: i64,
}

/// The asks the reader may decide, oldest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ShareAsks {
  pub asks: Vec<ShareAskRow>,
}

/// What a check answered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CheckAnswer {
  pub allowed: bool,
  pub grant: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub user: Option<String>,
}

/// A phone's new key, handed out once, and the hash it is kept by.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PhoneMade {
  pub key: String,
  pub hash: String,
}

/// The user a phone's key is made for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PhoneAsk {
  pub user: String,
}

/// A token issued before the model, carried onto a key of the same text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PhoneAdoptAsk {
  pub token: String,
  pub user: String,
}

/// The hash a token was kept by.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PhoneAdopted {
  pub hash: String,
}

/// A key asked after.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PhoneWhoAsk {
  pub key: String,
}

/// Whose a phone's key is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PhoneHolder {
  pub user: String,
  pub name: String,
  pub hash: String,
}

/// A fixed line asked for, with the fields its code carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum FixedLineAsk {
  /// A usage limit begins: the moment the rest is kept to, epoch seconds, which the line tells in the owner's time
  /// zone, or none for a rest kept to no known moment.
  RestBegins {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    until: Option<i64>,
  },
  ProviderDown,
  Compacting,
  CompactFailed,
  RunBroken {
    agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cause: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    record: Option<String>,
  },
  ChatDenied,
  GoingDownForUpdate {
    items: Vec<i64>,
  },
  GoingDown,
  SupervisorEngineError {
    kind: EngineError,
  },
  SupervisorCut {
    agent: String,
    reason: String,
  },
  Draw(DrawLine),
  /// A round's draft turn ran past its bound and goes on: said once in the round.
  StillWorking,
  /// People came into a room of a chat service (bmo-chat's `docs/contract.md`, 「Lines」): `by` is given only where
  /// someone other than those who came brought them in.
  PeopleJoined {
    people: Vec<LinePerson>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    by: Option<LinePerson>,
  },
  /// A person went out of a room of a chat service: `by` is given only where someone other than the person took
  /// them out.
  PersonLeft {
    person: LinePerson,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    by: Option<LinePerson>,
  },
  /// A person's run found no supply source left: `why`, the reason as the agency names it; the `until` it carries
  /// is not read.
  SupplyClosed {
    why: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    until: Option<i64>,
  },
}

/// A person as a chat service's line names them: their number in the room's sender numbering, which the line
/// carries and the sentence does not read, and the name the service shows for them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinePerson {
  pub sender_id: i64,
  pub name: String,
}

/// How a supervisor's engine ended its turn.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum EngineError {
  Busy,
  Refused,
  TooLong,
  Failed,
}

/// Everything a draw's room line carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct DrawLine {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  pub asked: DrawAsked,
  pub result: DrawResult,
  pub number: i64,
  pub seed: String,
  pub method: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub answered: Option<String>,
  pub next: String,
}

/// What a draw asked, by its shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "shape", rename_all = "kebab-case")]
pub enum DrawAsked {
  Dice {
    count: i64,
    sides: i64,
    modifier: i64,
  },
  Range {
    min: i64,
    max: i64,
  },
  Pick {
    items: i64,
    take: i64,
  },
  Shuffle {
    items: i64,
  },
}

/// What a draw came to, by its shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "shape", rename_all = "kebab-case")]
pub enum DrawResult {
  Dice { faces: Vec<i64>, total: i64 },
  Range { value: i64 },
  Pick { picked: Vec<String> },
  Shuffle { order: Vec<String> },
}

/// A fixed line asked for, with the language to say it in and the fields its code carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RenderAsk {
  /// The pack's language, `ko`.
  pub language: String,
  #[serde(flatten)]
  pub line: FixedLineAsk,
}

/// The sentence a fixed line renders as.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Rendered {
  pub text: String,
}

/// A sign-in's name and password.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginAsk {
  pub username: String,
  pub password: String,
  /// Omitted, the session lasts as long as the browser keeps it; true gives it the longer window.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub remember_me: Option<bool>,
}

/// A named account part: an organization or a role.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Named {
  pub id: i64,
  pub name: String,
}

/// The account behind a session, as sumida answers it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Session {
  pub id: i64,
  pub username: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub full_name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub email: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub phone: Option<String>,
  pub is_admin: bool,
  pub is_enabled: bool,
  pub is_banned: bool,
  pub organization: Named,
  pub role: Named,
  pub first_seen_at: String,
  pub last_seen_at: String,
  pub created_at: String,
  pub updated_at: String,
}

/// What a route that answers with nothing in particular sends: an empty object.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Empty {}
