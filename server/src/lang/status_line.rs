//! The one line at the foot of a resident program's screen (`lang/<language>/status-line.yaml`), each line
//! with the `{name}` marks its file names.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StatusLineWords {
  pub person: String,
  pub running: String,
}

crate::part!(pub STATUS_LINE: StatusLineWords = "status-line");
