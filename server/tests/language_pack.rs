//! The language pack's own test (docs/language-pack.md, 「How it is held」): every part the server reads
//! reads as its type, so a key a file lacks or a key no type declares fails here.

use bmo_web_server::lang::*;
use bmo_web_server::marks::fill_marks;

// A room's removal names another user's private chat by that user, filled into the pack's line by its mark
// and checked by key, never by the sentence.
#[test]
fn a_private_chats_warning_names_its_user_by_the_mark() {
  let line = &room_removal::ROOM_REMOVAL.warned.private;

  assert!(line.contains("{user}"));

  let filled = fill_marks(line, &[("user", "member-1")]);

  assert!(filled.contains("member-1") && !filled.contains("{user}"), "{filled}");
}

// Every part Rust says reads as its type, so a key the file lacks or a key no type declares fails here.
#[test]
fn every_part_reads_as_its_type() {
  assert!(!agent_catalogue::AGENT_CATALOGUE.roster.kinds.is_empty());
  assert!(!agents::AGENTS.node_checkout.busy.is_empty());
  assert!(!branch_split::BRANCH_SPLIT.clock.hours.is_empty());
  assert!(!archive_docs::ARCHIVE_DOCS.kinds.is_empty());
  assert!(!search::SEARCH.parts.is_empty());
  for field in [
    "ADDRESS",
    "MAP",
    "ROADVIEW",
    "MENU",
    "menu_alone",
    "RELEASED",
    "NEWER",
    "STOCK",
    "deal",
    "deal_usual",
    "deal_real",
    "review_link",
    "no_rating",
    "original",
  ] {
    assert!(!search::SEARCH.field(field).is_empty(), "{field}");
  }
  assert!(!chat_health::CHAT_HEALTH_WORDS.account.line.is_empty());
  assert!(!chat_turn::CHAT_TURN_WORDS.title.is_empty());
  assert!(!checkout_holds::CHECKOUT_HOLDS.waits.lock.is_empty());
  assert!(!claude_token::CLAUDE_TOKEN.kept.is_empty());
  assert!(!supervisors::SUPERVISOR_WORDS.engine_error.failed.is_empty());
  assert!(!consult::CONSULT_WORDS.said.is_empty());
  assert!(!control_answers::CONTROL_ANSWERS.request.action.is_empty());
  assert!(!deployment::DEPLOYMENT.rollback.reason.is_empty());
  assert!(!dev_servers::DEV_SERVER_WORDS.pane.head.is_empty());
  assert!(!files::FILES.mp3_title.is_empty());
  assert!(!remote_browser::REMOTE_BROWSER.run_title.is_empty());
  assert!(!reference_benches::REFERENCE_BENCHES.compare.front.is_empty());
  assert!(!tool_probe::TOOL_PROBE.columns.line.is_empty());
  assert!(!browse::BROWSE.run_title.is_empty());
  assert!(!draws::DRAWS.line.head.is_empty());
  assert!(fixed_lines::FIXED_LINES.rest_begins.contains("{chat_agent}"));
  assert!(!particles::PARTICLES.subject.unknown.is_empty());
  assert!(search::SEARCH.reading.untitled.contains("{place}"));
  assert!(!secret_kinds::SECRET_KINDS.kinds.is_empty());
  assert!(!full_suite::FULL_SUITE.account.is_empty());
  assert!(!generation::GENERATION_WORDS.refusals.number.is_empty());
  assert!(!job_ask::JOB_ASK.refusals.say.is_empty());
  assert!(!borrow::BORROW.parked.is_empty());
  assert!(!worker_fold::WORKER_FOLD.tally.words.failed.is_empty());
  assert!(!outside_hosting::OUTSIDE_HOSTING.refusal.is_empty());
  assert!(!job_questions::JOB_QUESTIONS.asked.lead.is_empty());
  assert!(!job_wait::JOB_WAIT.usage.is_empty());
  assert!(!laya_agreement::LAYA_AGREEMENT.gate.is_empty());
  assert!(!gate_eval::GATE_EVAL.status.head.is_empty());
  assert!(!memory_verbs::MEMORY_VERBS.usage.is_empty());
  assert!(!run_stop::RUN_STOP.done.asked.is_empty());
  assert!(!status_line::STATUS_LINE.resting.is_empty());
  assert!(!run_stop::RUNNING_REPORT.kinds.is_empty());
  assert!(!models::MODEL_WORDS.listing.defaults.is_empty());
  assert!(!node_land::NODE_LAND.pending.is_empty());
  assert!(!nodes::NODE_WORDS.clock.is_empty());
  assert!(!voice::VOICE_WORDS.title.is_empty());
  assert!(!owner_sends::OWNER_SENDS.too_large.is_empty());
  assert!(!process_memory::PROCESS_MEMORY.programs.is_empty());
  assert!(!machine_stand_in::MACHINE_STAND_IN.usage.is_empty());
  assert!(!providers::PROVIDER_WORDS.off.is_empty());
  assert!(!remote_desktop::REMOTE_DESKTOP.dials.is_empty());
  assert!(!resident_turn::TURN_WORDS.confirm.mark.is_empty());
  assert!(!roads::ROAD_WORDS.telegram.kinds.photo.is_empty());
  assert!(!room_grants::ROOM_GRANTS.owner_message.is_empty());
  assert!(!room_removal::ROOM_REMOVAL.warned.road.is_empty());
  assert!(!sends::SENDS.capabilities.is_empty());
  assert!(!songs::SONGS.run_title.is_empty());
  assert!(!sessions::SESSION_WORDS.reasons.route.is_empty());
  assert!(!span_words::SPAN_WORDS.tools.is_empty());
  assert!(!todo_blocks::TODO_BLOCKS.note.is_empty());
  assert!(!todo_reading::TODO_READING.time.no_tokens.is_empty());
  assert!(!todo_verbs::TODO_VERBS.settings.no_verb.is_empty());
  assert!(!usage_report::USAGE_REPORT.refresh.weekdays[0].is_empty());
  assert!(!word_chain::WORD_CHAIN_WORDS.lines.call.is_empty());
  assert!(!work_order_edits::WORK_ORDER_EDITS.steps.closing.is_empty());
  assert!(!work_order_stops::WORK_ORDER_STOPS.final_not_closed.is_empty());
  assert!(work_order_lines::WORK_ORDER_LINES.owner_stop.contains("{owner}"));
  assert!(work_lines::WORK_LINES.item.contains("{id}") && work_lines::WORK_LINES.round.contains("{round}"));
}

// A gate's Laya mode is said by its own word, never by its name.
#[test]
fn every_laya_mode_has_its_word() {
  for mode in ["off", "shadow", "filter", "asymmetric"] {
    assert_ne!(control_answers::CONTROL_ANSWERS.laya.mode_word(mode), mode);
  }
}

// Every line a job's question says to the owner names them by the mark the line is filled with.
#[test]
fn every_line_to_the_owner_names_them_by_the_mark() {
  let questions = &job_questions::JOB_QUESTIONS;

  for line in [&questions.asked.lead, &questions.asked.lapsed, &questions.pane.lead] {
    assert!(line.contains("{owner}"), "{line}");
  }
}

// A stage is named by its kind, and one of no known kind as finding things out.
#[test]
fn a_stage_is_named_by_its_kind_and_one_of_no_known_kind_finds_things_out() {
  let steps = &work_lines::WORK_LINES.steps;

  assert_eq!(steps.stage(Some("review")), steps.review);
  assert_eq!(steps.stage(Some("investigate")), steps.investigate);
  assert_eq!(steps.stage(None), steps.investigate);
  assert_eq!(steps.stage(Some("anything")), steps.investigate);
}

// The voice script's tables the figures are read by line up with the places they stand for.
#[test]
fn the_voice_scripts_figures_line_up_with_their_places() {
  let script = &voice_script::VOICE_SCRIPT;
  let figures = &script.figures;

  assert_eq!(figures.digits.len(), 10);
  assert_eq!(figures.places.len(), 4);
  assert_eq!(figures.native_ones.len(), 10);
  assert_eq!(figures.native_tens.len(), 10);
  assert_eq!(script.spoken.ordinals.len(), 20);
  assert!(!script.particles.pairs.is_empty());
}

// A step of a past round is refused by what was asked of it, and a paused order names its item.
#[test]
fn a_step_of_a_past_round_is_refused_by_what_was_asked_of_it() {
  let edits = &work_order_edits::WORK_ORDER_EDITS;

  assert_ne!(edits.steps.history_rerun, edits.steps.history_restore);
  assert!(edits.orders.paused.contains("{item}"));
}
