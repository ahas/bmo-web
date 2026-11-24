//! What keeps an account its holder's beyond the password (docs/accounts.md, 「Account security」): the platform's own
//! mail relay, the sign-in with its second factor, a password set again by a link, an email's verification, the
//! sessions a person sees and ends, and what the administrator and a person's heads do to an account.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// The header a call names the console's session by: the value of the session cookie it holds.
pub const SESSION_ID: &str = "session-id";

/// One of bmo-mail's outgoing server records, as the system mail is chosen from them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MailServer {
  /// bmo-mail's opaque id of the record.
  pub id: String,
  pub name: String,
  pub host: String,
}

/// The system mail as the administrator sets it: one of bmo-mail's outgoing servers, the sender's address and name,
/// and the secret it signs in with.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemMailAsk {
  /// The outgoing server's id at bmo-mail; none leaves system mail not set up.
  #[serde(default)]
  pub server: Option<String>,
  /// The sender's address every mail goes from.
  pub from: String,
  /// The sender's name, empty for none.
  #[serde(default)]
  pub from_name: String,
  /// The name of a secret of the kind `account-login` in the platform's space, which bmo-mail signs in to the server
  /// with; none for a server that asks for no sign-in.
  #[serde(default)]
  pub secret: Option<String>,
}

/// The system mail as set, with whether it is set up, whether the secret it names stands, and the outgoing servers
/// bmo-mail offers.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemMail {
  #[serde(default)]
  pub server: Option<String>,
  pub from: String,
  pub from_name: String,
  #[serde(default)]
  pub secret: Option<String>,
  /// bmo-mail is reached, a server is chosen and a sender's address stands.
  pub configured: bool,
  /// The secret named stands in the platform's space; true where none is named.
  pub secret_stands: bool,
  /// bmo-mail answered the list of its outgoing servers.
  pub mail_service: bool,
  pub servers: Vec<MailServer>,
}

/// A test mail asked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MailTestAsk {
  pub to: String,
}

/// A sign-in tried with a login and a password.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignInAsk {
  pub login: String,
  pub password: String,
  /// The token of a browser remembered for the second factor, where the browser holds one.
  #[serde(default)]
  pub device_token: Option<String>,
}

/// A sign-in finished with a code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SecondFactorAsk {
  pub ticket: String,
  /// A code from the authenticator, or a recovery code.
  pub code: String,
  /// Whether this browser is asked no code for 30 days.
  #[serde(default)]
  pub remember: bool,
}

/// How a sign-in stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum SignInOutcome {
  /// The session is made, its cookie set on the answer.
  SignedIn,
  /// The password matched, and the account asks a code.
  SecondFactor,
}

/// What a sign-in answers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignedIn {
  pub outcome: SignInOutcome,
  /// The user signed in, its id's digits.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub user: Option<String>,
  /// The organisation asks a second factor the account does not hold yet.
  #[serde(default)]
  pub enrol: bool,
  /// The ticket a code is handed back with.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub ticket: Option<String>,
  /// The token of this browser remembered, where `remember` was asked.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub device_token: Option<String>,
}

/// A reset link asked from the login screen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResetAsk {
  /// A login or an email.
  pub who: String,
  /// The console's public address the link opens under.
  pub link_base: String,
}

/// What a reset link stands for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ResetLink {
  pub login: String,
}

/// A new password set by a link.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NewPasswordAsk {
  pub password: String,
}

/// A link to be made, opening under the console's public address.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkAsk {
  pub link_base: String,
}

/// A password reset made for a person: mailed, with the address it went to partly hidden, or the link to hand over.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ResetMade {
  pub mailed: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub address: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub link: Option<String>,
}

/// An email verified.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EmailVerified {
  pub address: String,
}

/// What stands of an account's security.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AccountSecurity {
  pub email: String,
  pub email_verified: bool,
  pub second_factor: bool,
  pub recovery_codes_left: i64,
  pub second_factor_required: bool,
  pub enabled: bool,
  pub left: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub last_sign_in: Option<i64>,
  /// Mail is set up.
  pub mail: bool,
}

/// A second factor waiting to be confirmed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Enrolment {
  /// The secret in base32, for an authenticator that cannot scan.
  pub secret: String,
  /// The `otpauth://` address.
  pub uri: String,
  /// The address drawn as a QR code, an SVG document.
  pub qr: String,
}

/// A code typed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CodeAsk {
  pub code: String,
}

/// The recovery codes, shown once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCodes {
  pub recovery_codes: Vec<String>,
}

/// A password asked to confirm an act.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PasswordConfirm {
  pub password: String,
}

/// One session the sign-in made.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Device {
  pub id: i64,
  pub address: String,
  pub user_agent: String,
  pub made_at: i64,
  pub seen_at: i64,
  /// The session the call's `Session-Id` names.
  pub current: bool,
}

/// An account's devices standing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Devices {
  pub devices: Vec<Device>,
}

/// How a sign-in tried ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum TryOutcome {
  SignedIn,
  SecondFactor,
  WrongPassword,
  WrongCode,
  Throttled,
  Locked,
  Disabled,
}

/// One sign-in tried.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignInTry {
  pub at: i64,
  pub outcome: TryOutcome,
  pub address: String,
  pub user_agent: String,
}

/// An account's sign-ins tried, the newest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SignInTries {
  pub tries: Vec<SignInTry>,
}

/// An account enabled or disabled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EnabledAsk {
  pub enabled: bool,
}
