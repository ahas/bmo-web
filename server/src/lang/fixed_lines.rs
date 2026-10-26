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
  /// A companion's turn its guard cut short.
  pub companion_cut: String,
  /// A round's draft turn ran past its bound and goes on.
  pub still_working: String,
}

crate::part!(pub FIXED_LINES: FixedLines = "fixed-lines");
