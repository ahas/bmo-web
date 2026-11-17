//! The server's language pack (docs/language-pack.md): every word a person is told, one folder to a
//! language under the server's `lang/` and one YAML file in it to a part, compiled in here and imported by
//! the console's tests from the same files. Each part is read once, on first use, into its type.

use serde::de::DeserializeOwned;

pub mod agent_catalogue;
pub mod agents;
pub mod archive_docs;
pub mod backups;
pub mod borrow;
pub mod branch_split;
pub mod browse;
pub mod casebook;
pub mod chat_health;
pub mod chat_turn;
pub mod checkout_holds;
pub mod claude_token;
pub mod consult;
pub mod control_answers;
pub mod deployment;
pub mod dev_servers;
pub mod draws;
pub mod files;
pub mod fixed_lines;
pub mod full_suite;
pub mod gate_eval;
pub mod generation;
pub mod job_ask;
pub mod job_questions;
pub mod job_titles;
pub mod job_wait;
pub mod laya_agreement;
pub mod machine_stand_in;
pub mod memory_verbs;
pub mod models;
pub mod node_land;
pub mod nodes;
pub mod outside_hosting;
pub mod owner_sends;
pub mod particles;
pub mod process_memory;
pub mod providers;
pub mod reference_benches;
pub mod remote_browser;
pub mod remote_desktop;
pub mod resident_turn;
pub mod roads;
pub mod room_grants;
pub mod room_removal;
pub mod run_stop;
pub mod search;
pub mod secret_kinds;
pub mod sends;
pub mod sessions;
pub mod songs;
pub mod span_words;
pub mod status_line;
pub mod supervisors;
pub mod talk;
pub mod test_count;
pub mod todo_blocks;
pub mod todo_reading;
pub mod todo_verbs;
pub mod tool_calls;
pub mod tool_probe;
pub mod usage_report;
pub mod voice;
pub mod voice_script;
pub mod word_chain;
pub mod work_lines;
pub mod work_order_edits;
pub mod work_order_lines;
pub mod work_order_stops;
pub mod worker_fold;

/// One part read from its file's text. A file that does not read as its type is a fault of the build,
/// which every part's own test meets before anything runs on it.
pub fn read<T: DeserializeOwned>(file: &str, text: &str) -> T {
  serde_saphyr::from_str(text)
    .unwrap_or_else(|error| panic!("the language pack's {file} does not read: {error}"))
}

/// A part of the pack in the language the deployment speaks, compiled in from its file and read once
/// on first use: `crate::part!(pub WORDS: Words = "word-chain");`. The language is named here and
/// nowhere else on this side.
#[macro_export]
macro_rules! part {
  ($vis:vis $name:ident: $type:ty = $file:literal) => {
    $vis static $name: std::sync::LazyLock<$type> = std::sync::LazyLock::new(|| {
      $crate::lang::read(concat!("ko/", $file, ".yaml"), $crate::part_text!($file))
    });
  };
}

/// The language the pack is compiled in, as a caller names it: the folder `part!` and `part_text!` read.
pub const LANGUAGE: &str = "ko";

/// A part's file as it is written, in the language the pack is compiled in: `crate::part_text!("search")`.
#[macro_export]
macro_rules! part_text {
  ($file:literal) => {
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/lang/ko/", $file, ".yaml"))
  };
}
