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
}

crate::part!(pub FIXED_LINES: FixedLines = "fixed-lines");
