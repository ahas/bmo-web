//! What stopping a run from a shell says (docs/agent-control.md, 「Stopping」), each line with the
//! `{name}` marks its file names; and the words of the running report, `bmo run list`'s, whose span, kinds
//! and hold the stop's listing and the TODO verb say too.

use std::collections::BTreeMap;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunStop {
  pub usage: String,
  pub refusals: Refusals,
  pub reason: Reason,
  pub bot: Bot,
  pub list: List,
  pub done: Done,
  pub all: All,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Refusals {
  pub target: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reason {
  pub english: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bot {
  pub token: String,
  pub silent: String,
  pub refused: String,
  pub unread: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct List {
  pub empty: String,
  pub unnamed: String,
  pub head: String,
  pub left_out: String,
  pub turn: String,
  pub room: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Done {
  pub confirmed: String,
  pub asked: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct All {
  pub none: String,
  pub head: String,
  pub ended: String,
  pub stopping: String,
  pub refused: String,
}

crate::part!(pub RUN_STOP: RunStop = "run-stop");

/// The report of what is running and what is waiting, `bmo run list`'s: each section's heading and lines,
/// and the words the stop's listing, the TODO verb's queue lines and a research run's death share with it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunningReport {
  pub sections: Sections,
  pub span: Span,
  pub kinds: BTreeMap<String, String>,
  pub execution: Execution,
  pub unreachable: Unreachable,
  pub nodes: Nodes,
  pub testbed: TestbedLines,
  pub machine: MachineLines,
  pub deployment: Deployment,
  pub hold: ReportHold,
  pub switches: Switches,
  pub model: ModelMarks,
  pub runs: Runs,
  pub died: Died,
  pub watch: WatchWords,
  pub rooms: Rooms,
  pub workers: Workers,
  pub pending: Pending,
  pub orders: Orders,
  pub questions: Questions,
}

/// Each section's heading, in the order the report writes them.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sections {
  pub deployment: String,
  pub machine: String,
  pub testbed: String,
  pub nodes: String,
  pub switches: String,
  pub runs: String,
  pub unheld_watches: String,
  pub rooms: String,
  pub workers: String,
  pub pending: String,
  pub orders: String,
  pub questions: String,
}

/// An execution the archive holds open.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Execution {
  pub line: String,
  pub no_model: String,
  pub requested: String,
  pub unknown: String,
  pub shared_pane: String,
  pub no_parent: String,
}

/// A place that could not be asked.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Unreachable {
  pub no_token: String,
  pub bot: String,
  pub herdr: String,
}

/// The machines work goes round.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Nodes {
  pub machine: String,
  pub free: String,
  pub held: String,
  pub next: String,
  pub next_here: String,
}

/// The testbed's lanes: who holds each turn and who waits behind it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestbedLines {
  pub nobody: String,
  pub holder: String,
  pub waiting: String,
  pub job: String,
  pub todo: String,
  pub joiner: String,
  pub minutes: String,
  pub front: String,
  pub kept: String,
  pub narrow: String,
}

/// The machine read in one line, and why a launch is held on it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineLines {
  pub joiner: String,
  pub load: String,
  pub pressure: String,
  pub pressure_unread: String,
  pub available: String,
  pub swap: String,
  pub disk: String,
  pub jobs: String,
  pub free: String,
  pub held: String,
  pub reasons_joiner: String,
  pub unread: String,
  pub here: String,
  pub holds: MachineHolds,
  pub alerts: MachineAlerts,
  pub holders: MachineHolders,
}

/// What the machine watch tells the owner's session of the memory pressure, the disk and herdr's silences.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineAlerts {
  pub pressure: String,
  pub disk: String,
  pub herdr: String,
  pub herdr_method: String,
  pub methods_joiner: String,
}

/// Who holds the most of the machine's memory, as an alert carries it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineHolders {
  pub line: String,
  pub joiner: String,
  pub holder: String,
  pub job: String,
  pub todo: String,
  pub browsers: String,
}

/// Why a launch is held: each reading against its limit, and a work node whose link is down.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineHolds {
  pub pressure: String,
  pub available: String,
  pub load: String,
  pub disk: String,
  pub jobs: String,
  pub browser_jobs: String,
  pub node_down: String,
}

/// A deployment at work, or one cut off in the middle.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Deployment {
  pub unread: String,
  pub unit: String,
  pub step: String,
  pub step_code: String,
  pub cut: String,
  pub bot_old: String,
  pub bot_down: String,
  pub cut_ahead: String,
  pub schema: String,
  pub redeploy: String,
  pub backlog: String,
  pub backlog_unread: String,
  pub backlog_count: String,
}

/// The three switches, each by its label and its state.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Switches {
  pub queue: String,
  pub queue_paused: String,
  pub queue_on: String,
  pub hold: String,
  pub hold_none: String,
  pub keepalive: String,
  pub keepalive_stopped: String,
  pub keepalive_on: String,
}

/// Beside the road a job or a task went out on: the mark of a road the provider order fell to, and the mark
/// of a step whose runs went out on more than one (docs/work-orders.md, 「The model a step ran on」).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelMarks {
  pub fallback: String,
  pub changed: String,
}

/// What is said of a run beside its kind, agent, item, room, model and unit.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Runs {
  pub none: String,
  pub cap: String,
  pub stop: String,
  pub activity: String,
  pub wait: String,
  pub wait_until: String,
  pub wait_overdue: String,
  pub wait_unit: String,
  pub wait_pid: String,
  pub deploy_waits: String,
  pub pane: String,
  pub pane_agent_unknown: String,
  pub pane_status_unknown: String,
  pub pane_blocked: String,
}

/// A standing watch, under the run that holds it or under its own section.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WatchWords {
  pub timer: String,
  pub between_runs: String,
  pub head: String,
  pub no_memory: String,
  pub memory: String,
  pub note_whole: String,
  pub note: String,
  pub moment: String,
  pub condition: String,
  pub interval: String,
  pub unchecked: String,
  pub checked: String,
  pub timed_out: String,
  pub met: String,
  pub unmet: String,
}

/// A room folding its context or answering a round.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rooms {
  pub none: String,
  pub folding: String,
  pub answering: String,
  pub stop: String,
  pub unnamed: String,
}

/// Each checkout and what holds it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Workers {
  pub free: String,
  pub holds: String,
  pub order: String,
  pub lock: String,
  pub job: String,
  pub item: String,
  pub itemless: String,
}

/// The commits waiting to go live.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pending {
  pub none: String,
  /// No commit waiting, but main {count} commits past the live one, each named on a line of its own by its short
  /// {commit} and {subject}; or main against the live commit not read.
  pub ahead: String,
  pub ahead_commit: String,
  pub ahead_unread: String,
  pub urgent: String,
}

/// The work orders under way or stopped.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Orders {
  pub none: String,
  pub closing: String,
  pub no_worker: String,
  pub stage: String,
  pub stage_title: String,
  pub skipped: String,
  pub error: String,
  pub holding: String,
  pub place: String,
  pub attempt: String,
  pub status: BTreeMap<String, String>,
  pub phase: BTreeMap<String, String>,
  pub task: BTreeMap<String, String>,
}

/// The questions waiting on an answer.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Questions {
  pub none: String,
  pub paused: String,
  pub due: String,
  pub overdue: String,
}

/// A research run closed as died, as the chat agent is told of it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Died {
  pub research: String,
  pub search: String,
}

/// The deployment's hold in one line, as the report and the TODO verb's queue lines say it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportHold {
  pub line: String,
  pub commits_unread: String,
  pub takes_unread: String,
  pub takes: String,
  pub waiting_unread: String,
  pub waiting_none: String,
  pub waiting: String,
  pub passing: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Span {
  pub seconds: String,
  pub minutes: String,
  pub hours: String,
  pub ago: String,
  pub after: String,
  pub elapsed: String,
}

crate::part!(pub RUNNING_REPORT: RunningReport = "running-report");
