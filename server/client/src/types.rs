//! Every body and member the account service's routes carry (`docs/boundary.md`, 「What the server serves」).

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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

/// One room rule the deployment answers, handed to the data move.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoomRule {
  pub room: i64,
  pub id: String,
  pub subject: i64,
  pub words: String,
}

/// What the data move is handed: what only the other units hold.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveAsk {
  pub owner_senders: Vec<i64>,
  pub rooms: Vec<i64>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub room_rules: Vec<RoomRule>,
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

/// A user as the console reads them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UserView {
  pub user: String,
  pub name: String,
  pub administrator: bool,
  pub senders: Vec<i64>,
}

/// One user as the users list names them: their id, their name and whether they are the platform
/// administrator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UserSummary {
  pub user: String,
  pub name: String,
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
  pub job_title: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub landline: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub mobile: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub email: Option<String>,
}

/// The people a search found, in the organisation's own order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct People {
  pub people: Vec<Person>,
}

/// A user's sections, in the console's navigation order; every write is also a read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Sections {
  pub sections: Vec<SectionRow>,
}

/// A user's job title and contact details, which the account's holder or an administrator keeps
/// (docs/accounts.md, 「Users and senders」). Every field is a string, empty where the account keeps none.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
  pub job_title: String,
  pub landline: String,
  pub mobile: String,
  pub email: String,
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
}

/// Every secret the store holds, in the order of their names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Secrets {
  pub secrets: Vec<Secret>,
}

/// A value written under a name, replacing the one the name holds only where `replace` says so.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SecretAsk {
  pub value: String,
  #[serde(default)]
  pub replace: bool,
}

// The value never reaches a log line through a debug print.
impl std::fmt::Debug for SecretAsk {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter
      .debug_struct("SecretAsk")
      .field("value", &format_args!("({} bytes)", self.value.len()))
      .field("replace", &self.replace)
      .finish()
  }
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

/// A room relation asked of a sender.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RoomCheckAsk {
  pub room: i64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub sender: Option<i64>,
  pub relation: String,
}

/// A room relation asked of a message's sender.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MessageCheckAsk {
  pub room: i64,
  pub message: i64,
  pub relation: String,
}

/// A relation asked of a user on an object of the rules.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ObjectCheckAsk {
  pub kind: String,
  pub object: String,
  pub relation: String,
  pub user: String,
}

/// Whether a user heads a unit, asked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitCheckAsk {
  pub unit: i64,
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
}

/// Every unit, companies first and each unit after its parent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Units {
  pub units: Vec<UnitRow>,
}

/// A unit to make: a company where it names no parent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NewUnit {
  pub name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
}

/// A unit renamed or moved under another parent of its company.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitChange {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub parent: Option<i64>,
}

/// The unit a user is placed in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UnitPlacement {
  pub unit: i64,
}

/// An invitation to make.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct InviteAsk {
  pub unit: i64,
  #[serde(default)]
  pub head: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub hours: Option<i64>,
}

/// One invitation, as the one who made it reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Invite {
  pub token: String,
  pub unit: UnitRef,
  pub company: UnitRef,
  pub head: bool,
  pub expires_at: i64,
}

/// The open invitations a login reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Invites {
  pub invites: Vec<Invite>,
}

/// The units a login may invite into.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct InviteUnits {
  pub units: Vec<UnitRef>,
}

/// An invitation as its link shows it, to a person with no account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteView {
  pub unit: UnitRef,
  pub company: UnitRef,
  pub head: bool,
  pub expires_at: i64,
  pub state: String,
}

/// The name and the password an invitation is accepted with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AcceptAsk {
  pub name: String,
  pub password: String,
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
}

/// The machine an account is bound to and whether it is attached.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserNode {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub agent: Option<String>,
  pub attached: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub proven_at: Option<i64>,
}

/// What a check answered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CheckAnswer {
  pub allowed: bool,
  pub grant: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub user: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub sender: Option<i64>,
}

/// A grant standing on a room.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GrantRow {
  pub relation: String,
  /// The holder's subject key, such as `user:12` or `bmo_member:-7`.
  pub subject_key: String,
  /// Epoch milliseconds.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub expires_at: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub words: Option<String>,
}

/// The grants standing on a room.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Grants {
  pub grants: Vec<GrantRow>,
}

/// Whom a grant is to: a sender, a user, or every member of the room.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
pub struct Holder {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub sender: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub user: Option<String>,
  #[serde(default, skip_serializing_if = "std::ops::Not::not")]
  pub members: bool,
}

/// The message a grant is made or revoked on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct On {
  pub room: i64,
  pub id: i64,
}

/// A grant made: a room and a relation there, or a kind, an object and a relation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GrantAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub room: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub object: Option<String>,
  pub relation: String,
  pub to: Holder,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub words: Option<String>,
  /// Epoch milliseconds.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub expires_at: Option<i64>,
  pub message: On,
}

/// A grant revoked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RevokeAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub room: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub kind: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub object: Option<String>,
  pub relation: String,
  pub to: Holder,
  pub message: On,
}

/// What a grant wrote: the grant, its subject, and the holder's user where it is one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Granted {
  pub grant: String,
  pub subject: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub user: Option<String>,
}

/// What a revoke took back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Revoked {
  pub grant: String,
  pub revoked: i64,
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

/// One holding a room has of the service's, as a code and its count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Holding {
  /// `room_grants` or `room_senders`.
  pub code: String,
  pub count: i64,
}

/// What a room holds of the service's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Holdings {
  pub holdings: Vec<Holding>,
}

/// A fixed line asked for, with the fields its code carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum FixedLineAsk {
  /// A usage limit begins; the `until` it carries is not read.
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
