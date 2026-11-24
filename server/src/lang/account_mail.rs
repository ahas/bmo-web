//! The mail the platform sends of its own (`lang/<language>/account-mail.yaml`; docs/accounts.md, 「Account
//! security」): a subject and a body to each kind, and the words of how long a link stands.

use serde::Deserialize;

/// Every kind's words.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AccountMail {
  pub test: Letter,
  pub verify: Letter,
  pub reset: Letter,
  pub changed: Letter,
  pub locked: Letter,
  pub new_device: Letter,
  pub spans: Spans,
}

/// One mail's subject and its plain-text body.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Letter {
  pub subject: String,
  pub body: String,
}

/// How long a link stands, in minutes or hours, each with `{count}`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Spans {
  pub minutes: String,
  pub hours: String,
}

crate::part!(pub ACCOUNT_MAIL: AccountMail = "account-mail");
