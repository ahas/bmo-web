//! The fixed lines no other part holds (`lang/<language>/fixed-lines.yaml`), each line with the `{name}` marks
//! its file names.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FixedLines {
  /// A usage limit begins.
  pub rest_begins: String,
  /// The owner shut the room.
  pub chat_denied: String,
  /// A supervisor's turn its guard cut short.
  pub supervisor_cut: String,
  /// A round's draft turn ran past its bound and goes on.
  pub still_working: String,
  /// The chat agent's session is replaced and its memory tidied; the answer comes once it is done.
  pub memory_tidying: String,
  /// An account let into a room in the console by another.
  pub account_let_in: String,
  /// An account went out of a room in the console by itself.
  pub account_left: String,
  /// An account taken out of a room in the console by another.
  pub account_taken_out: String,
  /// Several accounts let into a room in the console by another, at once.
  pub accounts_let_in: String,
  /// An organisation's people let into a room in the console by another.
  pub unit_let_in: String,
  /// A person a chat service's line names, by the name the service shows for them.
  pub person: String,
  /// What stands between the people a line names together.
  pub people_joiner: String,
  /// People came into a room of a chat service by themselves.
  pub people_joined: String,
  /// People brought into a room of a chat service by another.
  pub people_joined_by: String,
  /// A person went out of a room of a chat service by themselves.
  pub person_left: String,
  /// A person taken out of a room of a chat service by another.
  pub person_taken_out: String,
  /// A person's run found no supply source left, one sentence to each reason.
  pub supply_closed: SupplyClosed,
}

/// What a room is told as a person's run finds no supply source left, by the reason the agency names.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplyClosed {
  pub no_order: String,
  pub withheld: String,
  pub no_personal: String,
  pub own_refused: String,
  pub no_organisation: String,
  pub organisation_refused: String,
  pub no_lendable: String,
  pub owned: String,
  pub refused: String,
  pub ran_out: String,
  /// A reason the pack holds no sentence for.
  pub other: String,
}

crate::part!(pub FIXED_LINES: FixedLines = "fixed-lines");
