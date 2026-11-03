//! What a supervisor's turn says of its own in a room (`lang/<language>/supervisors.yaml`).

use serde::Deserialize;

/// What a supervisor's turn says of its own in a room.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupervisorWords {
  pub engine_error: EngineError,
}

/// The `engine_error` lines: what a supervisor's turn its engine ended with an error leaves in the room, by the
/// error's kind.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EngineError {
  pub busy: String,
  pub refused: String,
  pub too_long: String,
  pub failed: String,
}

crate::part!(pub SUPERVISOR_WORDS: SupervisorWords = "supervisors");
