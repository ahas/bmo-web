import { modelFace } from "~/domain/model-face";
import { shortModel } from "#shared/model-short";
import { agentKind, agentLabel, roomTitle } from "./agents";
import { verdictTone } from "./judgements";

import type { AgentMode, GateRunRecord, JobRecord, LiveRun, LiveRunKind, RoomSummary, RunnerRecord, StopTarget, WatchView } from "#shared/types";
import type { VerdictTone } from "./judgements";
import type { Translate } from "#shared/wording";

// One standing group of runs on the live status screen: the gates, the runners and the job workers. Each stands
// whether anything runs or not, so they are this console's own arrangement rather than something grown out of what
// the bot happens to report.
export interface StatusGroup {
  key: LiveRunKind;
  label: string;
}

// Which section of the board stands: the role slots, one group of runs, or the transport records. One of them stands
// at a time, and which one is in the address.
export type LiveTab = "slots" | "executions" | LiveRunKind;

export interface LiveTabItem {
  value: LiveTab;
  label: string;
  icon: string;
}

// One finished run as the screen shows it: what it was, whose room it was for, how it ended
// and how long it took. Nothing anyone said reaches this shape.
export interface RecentRow {
  key: string;
  agent: string;
  room: string;
  outcome: string;
  tone: OutcomeTone;
  duration: string | null;
  at: number;
  note: string | null;
  // Where the row leads: the place in that agent's log where this run began.
  to: string;
}

export type OutcomeTone = "success" | "error" | "warning" | "neutral";

// The keys of the groups of runs, in the order they stand.
const LIVE_KEYS: readonly LiveRunKind[] = ["gate", "runner", "worker"];

// What each group of runs is called.
const LIVE_LABELS: Record<LiveRunKind, string> = {
  gate: "agents.label.group_gate",
  runner: "agents.label.group_runner",
  worker: "agents.label.group_worker"
};

// The groups of runs, each named in the pack's words.
export function statusGroups(t: Translate): readonly StatusGroup[] {
  return LIVE_KEYS.map((key) => ({ key, label: t(LIVE_LABELS[key]) }));
}

// The mark each section's tab wears. A group of runs wears the mark of what that branch does, and
// the two sections that are not a group of runs wear their own.
const LIVE_TAB_ICONS: Record<LiveTab, string> = {
  slots: "i-material-symbols-grid-view-outline",
  gate: "i-material-symbols-balance",
  runner: "i-material-symbols-travel-explore",
  worker: "i-material-symbols-folder-outline",
  executions: "i-material-symbols-receipt-long-outline"
};

// The sections of the board, in the order they stand.
export const LIVE_TABS: readonly LiveTabItem[] = [
  { value: "slots", label: "live.label.tab_slots", icon: LIVE_TAB_ICONS.slots },
  ...LIVE_KEYS.map((key) => ({ value: key, label: LIVE_LABELS[key], icon: LIVE_TAB_ICONS[key] })),
  { value: "executions", label: "live.label.tab_executions", icon: LIVE_TAB_ICONS.executions }
];

const DEPTH_LABELS: Record<string, string> = {
  basic: "common.label.depth_basic",
  thorough: "common.label.depth_thorough",
  exhaustive: "common.label.depth_exhaustive"
};

// A model as a person reads it. What is launched and what is recorded is the whole identifier; a
// screen with a model to show wears the short name instead.
//
// Only the models whose names no rule could work out stand here — a product name rather than a
// family and a generation. A Claude identifier is read by the rule the bot reads it by, so a model
// the CLI began offering an hour ago wears its own name on these screens with nothing added here.
const MODEL_LABELS: Record<string, string> = {
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-6-astra": "GPT-6 Astra",
  "qwen3.8-27b": "Qwen3.8 27B"
};

// The labels screens that do not read the bot's provider report show: a product by its own name, and a
// provider the console names in its own words by a key into the pack. A provider missing from both is shown
// by its own name.
const MODE_NAMES: Partial<Record<AgentMode, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek"
};

const MODE_KEYS: Partial<Record<AgentMode, string>> = {
  registered: "agents.title.registry"
};

// How a run ended, in the words the archive stores. A row that was never closed and whose
// unit is gone is the last of them: it died without reporting.
const OUTCOME_LABELS: Record<string, string> = {
  done: "live.label.outcome_done",
  "work-step": "live.label.outcome_work_step",
  // A search's own word on its own answer: it came back with a result and said itself that
  // something the question needed is still missing.
  unanswered: "live.label.outcome_unanswered",
  "cut-short": "live.label.outcome_cut_short",
  stopped: "live.label.outcome_stopped",
  failed: "live.label.outcome_failed",
  "live-tasks": "live.label.outcome_live_tasks",
  unclosed: "live.label.outcome_unclosed",
  limit: "live.label.outcome_limit",
  error: "live.label.outcome_error",
  died: "live.label.outcome_died",
  blocked: "live.label.outcome_blocked"
};

const OUTCOME_TONES: Record<string, OutcomeTone> = {
  done: "success",
  "work-step": "success",
  unanswered: "warning",
  "cut-short": "warning",
  stopped: "warning",
  failed: "error",
  "live-tasks": "warning",
  unclosed: "warning",
  limit: "warning",
  error: "warning",
  died: "error",
  // Nothing failed and nothing was tried: it is waiting to be answered, which is the board's
  // warning rather than its error.
  blocked: "warning"
};

// A gate ends on a verdict, and the board folds that verdict into one of three words. What
// the gate actually said is in its agent screen; a chip carries a state, never a sentence.
const GATE_OUTCOMES: Record<VerdictTone, string> = {
  success: "live.label.gate_passed",
  error: "live.label.gate_refused",
  neutral: "live.label.gate_judged"
};

// What an open row means once the bot's live list does not carry it: nobody closed it and the
// unit it ran in is gone.
const DIED = "died";

const MINUTE_SECONDS = 60;

export function depthLabel(t: Translate, depth: string): string {
  const key = DEPTH_LABELS[depth];

  return key === undefined ? depth : t(key);
}

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? modelFace(model);
}

export function modeLabel(t: Translate, mode: AgentMode): string {
  const key = MODE_KEYS[mode];

  return key === undefined ? MODE_NAMES[mode] ?? mode : t(key);
}

// What an agent begins on, the provider and the model each named as the bot named it where it did
// and by the console's own names otherwise; empty where it begins on nothing.
export function agentStartText(
  t: Translate,
  agent: { configuredMode?: AgentMode | null; configuredLabel?: string | null; model: string | null; modelLabel?: string | null }
): string {
  if (agent.configuredMode == null) return "";

  const provider = agent.configuredLabel ?? modeLabel(t, agent.configuredMode);
  const model = agent.model === null ? null : agent.modelLabel ?? modelLabel(agent.model);

  return [provider, model].filter(Boolean).join(" · ");
}

export function outcomeLabel(t: Translate, outcome: string): string {
  const key = OUTCOME_LABELS[outcome];

  return key === undefined ? outcome : t(key);
}

export function outcomeTone(outcome: string): OutcomeTone {
  return OUTCOME_TONES[outcome] ?? "neutral";
}

export function gateOutcome(t: Translate, verdict: string): string {
  return t(GATE_OUTCOMES[verdictTone(verdict)]);
}

export function isLiveTab(value: unknown): value is LiveTab {
  return LIVE_TABS.some((tab) => tab.value === value);
}

export function liveTabLabel(t: Translate, tab: LiveTab): string {
  const key = LIVE_TABS.find((one) => one.value === tab)?.label;

  return key === undefined ? tab : t(key);
}

// Seconds as a person watching them tick reads them: under a minute the seconds alone, under an
// hour minutes and seconds, past it hours as well, so a long run never reads as hundreds of minutes.
export function formatElapsed(t: Translate, seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));

  if (whole < MINUTE_SECONDS) {
    return t("common.label.seconds", { n: whole });
  }

  const minutes = Math.floor(whole / MINUTE_SECONDS);

  return minutes < 60
    ? t("common.label.minutes_seconds", { m: minutes, s: whole % MINUTE_SECONDS })
    : t("common.label.hours_minutes_seconds", { h: Math.floor(minutes / 60), m: minutes % 60, s: whole % MINUTE_SECONDS });
}

// How long something has been up, as a clock reads it: hours, minutes, seconds, each two
// digits. The hours run past 24 rather than rolling over, because what is asked is the length
// of the run and not the time of day.
export function uptimeClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));

  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

// What is left of the ceiling a run is held to, or how far past it the run has already gone.
export function formatRemaining(t: Translate, elapsedSeconds: number, capSeconds: number): string {
  const left = capSeconds - Math.floor(elapsedSeconds);

  return left >= 0
    ? t("live.label.remaining", { time: formatElapsed(t, left) })
    : t("live.label.overrun", { time: formatElapsed(t, -left) });
}

// A gate run is measured in milliseconds and is usually a few seconds; a longer one reads
// better as minutes.
export function formatMillis(t: Translate, ms: number): string {
  return ms < MINUTE_SECONDS * 1000 ? t("common.label.seconds", { n: (ms / 1000).toFixed(1) }) : formatElapsed(t, ms / 1000);
}

// Who set a run off, in the words a room reads. A run a room's session launched says that room; one the owner
// started from the console says the console, so a job the owner's own room set going reads as that room's in the
// room it lands in. A gate is launched by nobody: answering is what runs it.
export function launcherLabel(t: Translate, run: LiveRun, rooms: RoomSummary[]): string | null {
  if (run.startedBy === CONSOLE_LAUNCHER) {
    return t("live.label.launcher_console");
  }

  // A chat that launched it names itself, which is not always the chat the run reports to: a
  // job the owner's own room set going for another room reports there and is still their doing.
  const chat = /^chat:(-?\d+)$/.exec(run.startedBy ?? "");

  if (chat === null) {
    // Nobody wrote down who launched it — a gate, which nobody launches, or a launcher that
    // named no one. Guessing at the room it reports to would be a claim nothing supports.
    return null;
  }

  return t("live.label.launcher_room", { title: roomTitle(t, rooms, Number(chat[1])) });
}

// What a run of the queue is called on this screen: the item's number, and which run of that
// item this one is. The count is of runs and not of failures — an item whose work is divided
// into stages runs many times without anything having gone wrong — so it is said as a run and
// never as an attempt. There is no job number anywhere — a run with no item behind it is not
// numbered, and stands under the line its launcher wrote for why it was launched.
export function workLabel(t: Translate, record: { todoId?: number | null; attempt?: number; purpose?: string | null }): string | null {
  const todoId = record.todoId ?? null;

  // A row written before launches had to say carries neither; that reads as no label, never as a
  // number nobody can look up.
  if (todoId === null) {
    return record.purpose?.trim() || null;
  }

  const attempt = record.attempt ?? 1;

  return attempt > 1 ? t("live.label.work_item_run", { id: todoId, attempt }) : t("live.label.work_item", { id: todoId });
}

// What a run still going is called: its item, and where it is a step of a work order, how far that
// order has come. A record names one run and so says which run it was; a run under way is read for
// where the work stands, so it wears the order's progress and never a count of runs. A run of no
// work order has nothing to count and wears its item alone, and a run with no item wears why it
// was launched.
export function runningWorkLabel(t: Translate, run: Pick<LiveRun, "todoId" | "progress" | "purpose">): string | null {
  if (run.todoId === null) {
    return run.purpose?.trim() || null;
  }

  return run.progress === null
    ? t("live.label.work_item", { id: run.todoId })
    : t("live.label.work_item_progress", { id: run.todoId, progress: run.progress });
}

// What a run under way is standing still for, as its row says it, or nothing.
export function waitingLabel(t: Translate, run: Pick<LiveRun, "waiting">): string | null {
  return run.waiting === "confirmation"
    ? t("live.status.waiting_confirmation")
    : run.waiting === "question"
      ? t("live.status.waiting_answer")
      : null;
}

// What a launcher writes down as itself: the console, or the chat whose session ran it.
export const CONSOLE_LAUNCHER = "console";

export function chatLauncher(chatId: number): string {
  return `chat:${chatId}`;
}

export function liveRunsOf(runs: LiveRun[], group: StatusGroup): LiveRun[] {
  return runs.filter((run) => run.kind === group.key).sort((left, right) => left.startedAt - right.startedAt);
}

// Where a row of this board leads. Every one of them leads to the log of the agent that ran,
// because that is the only place what a run did is written down.
export function agentLink(agent: string): string {
  return `/agents/${encodeURIComponent(agent)}`;
}

// A runner and a job each ran in a unit of their own, and the log keeps their lines under that
// name, so their rows ask for the run by name and land on it whatever the clock says.
export function unitLink(agent: string, unit: string): string {
  return `${agentLink(agent)}?run=${encodeURIComponent(unit)}`;
}

// A moment in an agent's log. The screen opens on the run that moment falls in, so this is how
// anything that knows when something happened — a gate's verdict, a request the cache watch
// saw — sends a reader to the lines it happened in.
export function momentLink(agent: string, at: number): string {
  return `${agentLink(agent)}?at=${at}`;
}

// A gate has no unit and its lines are kept under a number the bot counts afresh each time it
// starts, so its row asks by the second it began and the room it was judging — one gate of one
// stage judges one room at a time, so the two together name the run.
export function gateLink(agent: string, startedAt: number, chatId: number): string {
  return `${momentLink(agent, startedAt)}&chat=${chatId}`;
}

// A run still going leads to the end of its log instead, which is where its next line lands.
export function liveRunLink(run: LiveRun): string {
  return agentLink(run.agent);
}

// What a stop on this row is aimed at, as the bot named it when it drew the picture
// (`the agency's docs/agent-control.md` 「Stopping」). Nothing here works a target out of the row's shape: the
// one place that decides a gate is reached by its execution and a runner by its unit is the bot's
// own verb. A picture drawn by a bot that did not yet name one falls back to the unit, which is
// what a run standing apart has always been stopped by, and a row with neither names nothing.
export function stopTargetOf(row: Pick<LiveRun, "stop" | "unit">): StopTarget | null {
  // Absent is an older picture, which is not the same as a row saying it has nothing to aim at:
  // one is answered with the unit, the other is taken at its word.
  return row.stop === undefined ? (row.unit === null ? null : { kind: "unit", id: row.unit }) : row.stop;
}

// Whether a row can be stopped from this screen at all. A row that names nothing wears no button:
// there is nothing to aim at, so there is nothing to offer.
export function stoppable(row: Pick<LiveRun, "stop" | "unit">): boolean {
  return stopTargetOf(row) !== null;
}

// The watch under a runner's row is that run's own promise, so what stops it is the run holding
// it; a timer, and a check no run holds, have nothing to stop.
export function watchStopTarget(watch: Pick<WatchView, "stop" | "unit">): StopTarget | null {
  return stopTargetOf(watch);
}

// When a gate run began: the archive keeps the second its verdict was recorded and how long the
// run took, and a gate is short enough that the two make its start.
export function gateStartedAt(record: GateRunRecord): number {
  return record.ms === null ? record.at : record.at - Math.round(record.ms / 1000);
}

// A gate's verdict is its outcome, folded to one word and told apart by the same tone the
// room view gives that verdict.
export function gateRows(t: Translate, records: GateRunRecord[], rooms: RoomSummary[]): RecentRow[] {
  return newestFirst(
    records.map((record) => ({
      key: `gate:${record.id}`,
      agent: agentLabel(t, record.agent),
      room: roomTitle(t, rooms, record.chatId),
      outcome: gateOutcome(t, record.verdict),
      tone: verdictTone(record.verdict),
      duration: record.ms === null ? null : formatMillis(t, record.ms),
      at: record.at,
      note: record.messageId === null ? null : `#${record.messageId}`,
      to: gateLink(record.agent, gateStartedAt(record), record.chatId)
    }))
  );
}

// The runs table holds a row for every run that stands in a unit of its own, the runners' and
// the editors' alike, so a board showing one kind takes the rows whose agent is of that kind and
// leaves the rest to the block they belong to. Which kind an agent is comes from the catalogue,
// and an agent it says nothing about counts as a runner — every row this table held before an
// editor opened one was a runner's.
//
// A row the archive never closed is only finished if the bot's live list has let go of it; then
// it died without reporting.
export function runRows(
  t: Translate,
  records: RunnerRecord[],
  live: LiveRun[],
  rooms: RoomSummary[],
  kind: LiveRunKind
): RecentRow[] {
  const running = new Set(live.filter((run) => run.kind === kind).map((run) => run.id));

  return newestFirst(
    records
      .filter((record) => runKindOf(record.agent) === kind && !running.has(record.id))
      .map((record) => ({
        key: `run:${record.id}`,
        agent: agentLabel(t, record.agent),
        room: roomTitle(t, rooms, record.chatId),
        outcome: outcomeLabel(t, record.outcome ?? DIED),
        tone: outcomeTone(record.outcome ?? DIED),
        duration: record.finishedAt === null ? null : formatElapsed(t, record.finishedAt - record.startedAt),
        at: record.finishedAt ?? record.startedAt,
        note: record.depth === null ? null : depthLabel(t, record.depth),
        // A runner's log is kept under the name of the unit it ran in, so its row asks for that
        // run by name.
        to: unitLink(record.agent, record.unit)
      }))
  );
}

// What kind of run a row is: a repository's is a job worker's, and every other a runner's.
function runKindOf(agent: string): LiveRunKind {
  return agentKind(agent) === "repository" ? "worker" : "runner";
}

export function jobRows(t: Translate, records: JobRecord[], live: LiveRun[], rooms: RoomSummary[]): RecentRow[] {
  const running = new Set(live.filter((run) => run.kind === "worker").map((run) => run.id));

  return newestFirst(
    records
      .filter((record) => !running.has(record.id))
      .map((record) => ({
        key: `job:${record.id}`,
        // The worker that did it, under the name the owner calls that worker by. There is more
        // than one and each keeps a log of its own, so the row is read and led by the job's own
        // worker rather than by the one this repository has always had.
        agent: agentLabel(t, record.worker),
        room: roomTitle(t, rooms, record.chatId),
        outcome: outcomeLabel(t, record.outcome ?? DIED),
        // A job that reported but reported a failure is a failure whatever word it ended on.
        // A run the owner stopped is not one: it reads as stopped, in its own colour.
        tone: record.ok === false && record.outcome !== "stopped" ? ("error" as const) : outcomeTone(record.outcome ?? DIED),
        duration: record.finishedAt === null ? null : formatElapsed(t, record.finishedAt - record.launchedAt),
        at: record.finishedAt ?? record.launchedAt,
        // What a run is called: the item it was a run of, and the model it ran on. A run of no
        // item wears no number, because there is none to look up.
        note: [workLabel(t, record), placeOf(record), record.model === null ? null : shortModel(record.model)]
          .filter((part): part is string => part !== null)
          .join(" · ") || null,
        to: unitLink(record.worker, record.unit)
      }))
  );
}

// Where a job ran: its repository, with the checkout beside it where that is not the repository's own name.
export function placeOf(run: { repository?: string | null; checkout?: string | null }): string | null {
  const repository = run.repository ?? null;
  const checkout = run.checkout ?? null;

  if (repository === null) return checkout;

  return checkout === null || checkout === repository ? repository : `${repository} · ${checkout}`;
}

function newestFirst(rows: RecentRow[]): RecentRow[] {
  return rows.sort((left, right) => right.at - left.at);
}


