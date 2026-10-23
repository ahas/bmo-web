//! What a companion's settings are refused with and how they are printed (`lang/<language>/companions.yaml`), each line with the `{name}`
//! marks its file names.

use serde::Deserialize;

/// What a companion's settings are refused with and how they are printed.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompanionWords {
  pub refusals: Refusals,
  pub view: View,
  pub shell: Shell,
  pub say: Say,
  pub follow: Follow,
  pub reset: Reset,
  pub added: Added,
  pub engine_error: EngineError,
}

/// The `engine_error` lines: what a companion's turn its engine ended with an error leaves in the room, by the
/// error's kind.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EngineError {
  pub busy: String,
  pub refused: String,
  pub too_long: String,
  pub failed: String,
}

/// The `added` lines: why a companion was not added on the console or not removed there, and what an add that
/// took back a standing room says.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Added {
  pub name: String,
  pub name_taken: String,
  pub label: String,
  pub provider: String,
  pub model: String,
  pub worker: String,
  pub room: String,
  pub seeded: String,
  pub taken_back: String,
}

/// The `shell` lines: what `bmo companion` says beside its subcommands.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Shell {
  pub by: String,
  pub unknown_flag: String,
  pub none: String,
}

/// The `say` lines: the owner's words said into a room made for companions.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Say {
  pub usage: String,
  pub empty: String,
  pub not_a_room: String,
  pub no_token: String,
  pub unanswered: String,
  pub answered: String,
  pub head: String,
  pub handed: String,
  pub follow_hint: String,
  pub not_called: String,
  pub answering: String,
  pub sent: String,
  pub failed: String,
  pub unanswered_turn: String,
  pub bmo_elsewhere: String,
}

/// The `follow` lines: an agent's session in a room as its pane prints it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Follow {
  pub usage: String,
  pub unknown_agent: String,
  pub no_session: String,
  pub turn: String,
  pub room: String,
  pub generation: String,
  pub generation_opened: String,
}

/// The `reset` lines: a companion started afresh, as the route answered it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reset {
  pub usage: String,
  pub conversation: String,
  pub person: String,
  pub head: String,
  pub preview: String,
  pub run: String,
  pub alone: String,
  pub shared: String,
  pub rows: String,
  pub row: String,
  pub files: String,
  pub file: String,
  pub writers: String,
  pub brain: String,
  pub copies: String,
  pub copy: String,
  pub copy_failed: String,
  pub left: String,
}

/// The `view` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct View {
  pub usage: String,
  pub on: String,
  pub off: String,
  pub default: String,
  pub head: String,
  pub model: String,
  pub serving: String,
  pub base_prompt: String,
  pub no_base_prompt: String,
  pub pieces: String,
  pub reference: String,
  pub generation: String,
  pub own_piece: String,
  pub persona: String,
  pub persona_file: String,
  pub persona_set: String,
  pub system: String,
  pub session: String,
  pub session_reset: String,
}

/// The `refusals` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Refusals {
  pub not_companion: String,
  pub generation_pairs: String,
  pub not_generation: String,
  pub reference: String,
  pub own_pairs: String,
  pub own_name: String,
  pub own_size: String,
  pub pieces: String,
  pub pieces_twice: String,
  pub pieces_none: String,
  pub persona: String,
  pub registration: String,
  pub thinking: String,
  pub reset_reason: String,
}

crate::part!(pub COMPANION_WORDS: CompanionWords = "companions");
