import { DONE_PAGE_SIZE } from "#shared/config";
import { shownInside, spanFace } from "./spans";
import { formatStamp, remainingText, spanClock, toUnixSeconds } from "bmo-ui/app/domain/time";
import { heldLabel } from "~/domain/queue-place";
import { queueTurnWord } from "~/domain/queue-place";
import { CONVERSATION_HEAD, instructionSegments, orderedSegments, PART_ORDER, SAID_LABELS } from "#shared/todo-blocks";
import { tokenText } from "./usage";
import { itemRanModel } from "#shared/ran-model";
import { shortModel } from "#shared/model-short";
import { todoModelPlan } from "./todo-models";

import type { SearchField } from "bmo-ui/shared/search";
import type { ItemTestbedTurn, JobChosenBy, RoomSummary, TodoAction, TodoApproval, TodoBoard, TodoItem, TodoReport, TodoReview, TodoSpan } from "#shared/types";
import type { BarColor } from "bmo-ui/app/domain/bars";
import type { Translate } from "#shared/wording";

export interface TodoSection {
  key: "pending" | "queue" | "held" | "merged" | "done";
  label: string;
  items: TodoItem[];
  // What stands in the section's place when it holds nothing.
  empty: string;
}

// Where one item stands, in the words the panel speaks: waiting on the owner, waiting in the
// queue, being launched, being done by a job, held while its run still goes, done but still being
// reported, set aside, merged into another item and waiting for it, or done.
export type TodoState = "pending" | "waiting" | "starting" | "running" | "stopping" | "reporting" | "held" | "merged" | "done";

// What the filter chips name. Reporting and waiting-to-stop are not among them: each is a state a
// row wears on its way out, not one anybody would sit and watch a list of. A job is still going on
// for a row in either, so the running chip shows both; starting is a moment of that same job.
export type TodoFilter = "all" | Exclude<TodoState, "reporting" | "stopping" | "starting">;

export interface TodoView {
  filter: TodoFilter;
  conditions: TodoConditions;
}

// What the rows are narrowed to beyond their state, one column of the table each, and null where
// that column is not asked about. They are carried to the archive rather than applied to the rows
// in hand: the finished list comes a page at a time, and narrowing only the page on the screen
// would leave it thin and say nothing about the rows behind it.
export interface TodoConditions {
  // The worker that does a row. A row nobody assigned is the built-in worker's, so asking for
  // that worker by its name finds those rows too.
  worker: string | null;
  // An outstanding note still standing, or one already resolved.
  unfinished: "open" | "resolved" | null;
  // The room a request came from, or NO_ROOM for one filed outside every room.
  chat: string | null;
  requester: string | null;
}

// What the room condition's value is for a request filed outside every room.
export const NO_ROOM = "-";

export const NO_CONDITIONS: TodoConditions = { worker: null, unfinished: null, chat: null, requester: null };

const CONDITION_KEYS = Object.keys(NO_CONDITIONS) as (keyof TodoConditions)[];

const FILTERS: readonly TodoFilter[] = ["all", "waiting", "running", "pending", "held", "merged", "done"];

export const DEFAULT_VIEW: TodoView = { filter: "all", conditions: NO_CONDITIONS };

// The key of what the panel calls each state, one word to a row. A row on its way to being set
// aside says so in the bot's own words, which it is handed with the kind of hold.
const STATE_LABELS: Record<Exclude<TodoState, "stopping">, string> = {
  pending: "todo.label.state_pending",
  waiting: "todo.label.state_waiting",
  starting: "todo.label.state_starting",
  running: "todo.label.state_running",
  reporting: "todo.label.state_reporting",
  held: "todo.label.state_held",
  merged: "todo.label.state_merged",
  done: "todo.label.state_done"
};

// What each kind of report is called where it is read.
export const REPORT_KIND_LABELS: Record<TodoReport["kind"], string> = {
  final: "todo.label.report_final",
  progress: "todo.label.report_progress",
  held: "todo.label.report_held"
};

// The words an entry of an item's review is headed by, by its kind.
export const REVIEW_KIND_LABELS: Record<TodoReview["kind"], string> = {
  opened: "todo.label.review_opened",
  report: "todo.label.review_report",
  question: "todo.label.review_question",
  answer: "todo.label.review_answer",
  rejection: "todo.label.review_rejection",
  pass: "todo.label.review_pass",
  escalation: "todo.label.review_escalation",
  ruling: "todo.label.review_ruling",
  accepted: "todo.label.review_accepted"
};

// The words each check of a review is named by; a check the console does not know stands as its own name.
const REVIEW_CHECK_LABELS: Readonly<Record<string, string>> = {
  promises: "todo.label.review_check_promises",
  decisions: "todo.label.review_check_decisions"
};

export function reviewCheckLabel(t: (key: string) => string, check: string): string {
  const key = REVIEW_CHECK_LABELS[check];

  return key === undefined ? check : t(key);
}

// The row's report mark in words: how many reports the item keeps and of which kinds, in the order they stand.
export function reportsTip(t: Translate, reports: readonly TodoReport[]): string {
  const kinds = [...new Set(reports.map((report) => report.kind))].map((kind) => t(REPORT_KIND_LABELS[kind]));

  return [t("todo.label.report_count", { n: reports.length }), kinds.join(", ")].join(" · ");
}

// The line a stopped row carries under its badge: what stopped it, and — while it stands at the head
// of its worker's queue — where it stands and why it is not resumed yet, in the bot's own words.
// The one short line a stopped order at the head of its worker's queue says on its card: its turn
// alone — "held, its turn to resume". What stopped it and why it waits stand whole in the item's detail
// (stopDetail), and how many times it failed is a badge of its own.
export function stoppedLine(t: Translate, item: TodoItem): string | null {
  const stop = item.stopped;

  return stop === null || stop.place === null ? null : queueTurnWord(t, stop.place);
}

// A stopped order's stand whole, for the item's detail: what stopped it, its turn with why, and the
// failures counted.
export function stopDetail(t: Translate, item: TodoItem): { reason: string | null; turn: string; why: string; failures: number } | null {
  const stop = item.stopped;

  return stop === null || stop.place === null
    ? null
    : { reason: stop.reason, turn: queueTurnWord(t, stop.place), why: stop.place.why, failures: stop.failures };
}

// The line a running row carries while its job stands on a long wait it marked: what it waits on,
// the target, and what is left of the time it gave, or that the time has passed.
export function waitingLine(t: Translate, item: TodoItem, now: number): string | null {
  const wait = item.waiting;

  if (wait === null) {
    return null;
  }

  const left = wait.until > now ? remainingText(t, wait.until, now) : t("todo.label.waiting_overdue");

  return wait.target.kind === "unit"
    ? t("todo.label.waiting_unit", { what: wait.what, name: wait.target.name, left })
    : t("todo.label.waiting_pid", { what: wait.what, pid: wait.target.pid, left });
}

// Whether the time a marked wait gave has passed, which the line says in the warning colour.
export function waitingOverdue(item: TodoItem, now: number): boolean {
  return item.waiting !== null && item.waiting.until <= now;
}

// The line a running row carries while a backlog deployment holds the queue waiting for its job.
export function deployWaitsLine(t: Translate, item: TodoItem): string | null {
  return item.deployWaits ? t("todo.label.deploy_waits") : null;
}

// The sentence of the line a running row carries while its job stands in the testbed's queue: the command holding a
// seat, or its place in its lane's line (docs/web.md, the TODO panel's section). The row fills in the command and
// the place, which turns as it moves up.
export function testbedLineKey(turn: ItemTestbedTurn): string {
  return turn.place === null ? "todo.label.testbed_holding" : "todo.label.testbed_waiting";
}

// How wide the panel may be dragged. Narrower than the first and a row is unreadable; wider
// than the second and the conversation it stands beside is the one that suffers.
export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH = 640;
export const PANEL_DEFAULT_WIDTH = 320;

// Where an item stands is the run's own answer: an item a job is going on for is under way, and
// one no job is going on for waits. The status line is a word a session was asked to write after it
// launched, so it is never asked — a job whose session never wrote it is running all the same,
// and an item whose runner died is not.
//
// An item bmo-job marks done while the agency's job for it is still going is reporting, until the agency says the job
// ended; no clock of the console's bounds it, since a job whose runner died is ended by the agency's own sweep
// (docs/web.md, the TODO panel's section).
export function todoState(item: TodoItem, _now: number = toUnixSeconds(Date.now())): TodoState {
  if (item.done) {
    return item.reporting === true || (item.liveState ?? null) !== null ? "reporting" : "done";
  }

  // Merged is what a row is before anything else it could be: its work is carried by the item it
  // names, and nothing about its own approval or hold decides where it stands.
  if (item.mergedInto !== null) {
    return "merged";
  }

  // Set aside is what a row is before it is anything else: the queue does not see it, so
  // whether it would otherwise be waiting or waiting on him says nothing about where it stands.
  // Until a run of it has ended, though, it is only on its way there.
  // One held by its job only until its commit goes live is waiting, its way live said beside it.
  if ((item.heldAt !== null || item.status === "held") && !item.deployHeld) {
    return item.holdPending ? "stopping" : "held";
  }

  // A draft waits on the owner; an item past it is in the queue whether or not an approval stands on it.
  if (item.awaitingApproval) {
    return "pending";
  }

  // A job that waits for its agent's seat, a road or a card launches nothing yet, so its item waits as one nobody
  // has taken; a job whose worker is being launched has started but is not doing the work yet. The item's lease
  // says nothing here: a launch leases its item before the agency writes its job, so an item leased with no job
  // under way still waits.
  if (item.liveState === "starting") {
    return "starting";
  }

  return item.liveState === "running" ? "running" : "waiting";
}

// Whether a job is still going on for a row in this state: under way, winding down on its way to
// being held, or finished and still writing its report. It is the one answer to running — the pin at
// the head of the queue, the running chip and its count all ask it — and it is the same fact
// `running.ts` reads, an item with a job line not yet ended.
export function jobGoingOn(state: TodoState): boolean {
  return state === "starting" || state === "running" || state === "stopping" || state === "reporting";
}

// The agent a row names (docs/web.md, the TODO panel's section): while a job of it is under way, the agent that job runs
// on, as the agency says; otherwise the agent its `agent` label names. None where neither names one.
export function itemAgent(item: Pick<TodoItem, "agent" | "jobAgent">): string | null {
  return item.jobAgent ?? item.agent;
}

// Whom a row's work goes to when no job of it is under way and it names no agent (docs/web.md, the TODO panel's
// section): a model and the role whose free agent takes it at the launch, the role null where its label names none.
// None while a job runs, which names its own agent, and where the item names an agent, which stands over a model.
export function itemFreeAgent(item: Pick<TodoItem, "agent" | "jobAgent" | "model" | "role">): { role: string | null; model: string } | null {
  if (itemAgent(item) !== null || item.model === null) return null;

  return { role: item.role ?? null, model: item.model };
}

// The chip and its tooltip a row assigned by a model and a role wears in place of an agent's name.
export function freeAgentWords(t: Translate, free: { role: string | null; model: string }): { label: string; tip: string } {
  return free.role === null
    ? { label: t("todo.label.assign_free_any"), tip: t("todo.label.assign_free_any_tip", { model: free.model }) }
    : { label: t("todo.label.assign_free", { role: free.role }), tip: t("todo.label.assign_free_tip", { role: free.role, model: free.model }) };
}

// The model a row wears, short, or whole where `whole` asks for its tooltip (docs/web.md, the TODO panel's section): while a job
// of it runs, the road that run actually took; otherwise the road of the agent the row names, the one its job goes
// out on, or where it names none the model its `model` label names. None where the item names neither yet, since
// nothing chooses a road for it until one is named.
export function itemModel(item: Pick<TodoItem, "id" | "model" | "agent" | "jobAgent" | "worker">, whole = false): string | null {
  const known = todoModelPlan().value;
  const agent = itemAgent(item);
  const named = agent === null ? item.model : (known?.agents[agent] ?? null);
  const road = known?.running[item.id] ?? named;

  return road === null || road === undefined ? null : whole ? road : shortModel(road);
}

// What chose a running job's road, in the pack's words.
const CHOSEN_BY_WORDS: Record<JobChosenBy, string> = {
  item: "todo.label.chosen_item",
  forced: "todo.label.chosen_forced",
  pin: "todo.label.chosen_pin",
  order: "todo.label.chosen_order"
};

// The tooltip a row's model chip carries (docs/web.md, the TODO panel's section): the model whole, and while a job of it
// runs, after it what chose that job's road where the agency says. None where it would only repeat the chip.
export function itemModelTip(t: Translate, item: Pick<TodoItem, "id" | "model" | "agent" | "jobAgent" | "worker">): string | null {
  const whole = itemModel(item, true);

  if (whole === null) return null;

  const running = todoModelPlan().value?.running[item.id];
  const chosen = running === undefined ? undefined : todoModelPlan().value?.chosenBy[item.id];

  if (chosen !== undefined) return t("todo.label.model_chosen_by", { model: whole, by: t(CHOSEN_BY_WORDS[chosen]) });

  return whole === itemModel(item) ? null : whole;
}

// The word a row wears. An item no job is going on for reads waiting whatever the table happens to
// say. A row a run has reads running, and where the run is a step of a work order it says how far
// the order has come in the bot's own words — investigate, build 1/4, plan. How many times the item
// has been run is not said here: that is history rather than progress, and the time line under the
// account says it once the runs have ended. A one-session job has nothing to count, so it is
// running alone.
export function stateLabel(t: Translate, item: TodoItem, now: number = toUnixSeconds(Date.now())): string {
  const state = todoState(item, now);

  // A row waiting because its work order stopped says so: it is not waiting its turn like the rows
  // around it, and what stopped it is read under the badge.
  if (state === "waiting" && item.stopped !== null) {
    return t("todo.label.state_stopped");
  }

  // A merged row names the item carrying it.
  if (state === "merged") {
    return t("todo.label.merged_into", { id: item.mergedInto! });
  }

  // A held row says who set it aside: a plain hold, the owner's stop, or a hold for failure.
  if (state === "held" || state === "stopping") {
    return heldLabel(t, item.heldKind, state === "stopping");
  }

  if (state !== "running") {
    return t(STATE_LABELS[state]);
  }

  return item.progress === null ? t(STATE_LABELS.running) : t("todo.label.state_running_progress", { progress: item.progress });
}

// The colour that word wears, in the theme's own names. A finished row is told apart from the
// ones standing beside it by its colour before anybody reads it, so done wears the console's
// word for finished and the two states that are merely at rest — waiting and held — stand neutral,
// having nothing to say. Reporting wears what running wears: the item is done, but its run is
// still going, so it is not finished yet. It reads the state through the same answer the label
// does, so the word and the colour on one row can never disagree.
// The mark a row's state wears beside its word.
const STATE_ICONS: Record<TodoState, string> = {
  pending: "i-material-symbols-approval-outline",
  waiting: "i-material-symbols-schedule-outline",
  starting: "i-material-symbols-progress-activity",
  running: "i-material-symbols-progress-activity",
  stopping: "i-material-symbols-pause-circle-outline",
  reporting: "i-material-symbols-progress-activity",
  held: "i-material-symbols-pause-circle-outline",
  merged: "i-material-symbols-merge",
  done: "i-material-symbols-check-circle-outline"
};

export function stateIcon(item: TodoItem, now: number = toUnixSeconds(Date.now())): string {
  const state = todoState(item, now);

  if (state === "waiting" && item.stopped !== null) return "i-material-symbols-stop-circle-outline";
  // The owner's own stop wears a raised hand, told apart from a hold at a glance.
  if ((state === "held" || state === "stopping") && item.heldKind === "stop") return "i-material-symbols-back-hand-outline";
  return STATE_ICONS[state];
}

export function stateColour(
  item: TodoItem,
  now: number = toUnixSeconds(Date.now())
): "primary" | "success" | "warning" | "neutral" {
  const state = todoState(item, now);

  if (state === "done") {
    return "success";
  }

  if (state === "pending" || state === "stopping" || (state === "waiting" && item.stopped !== null)) {
    return "warning";
  }

  return state === "running" || state === "reporting" ? "primary" : "neutral";
}

// Where a finished item's outstanding note stands: the item left none, it is still outstanding, or
// it has been resolved. The unit is the note whole — such a note is prose, so marking a piece inside one
// would mean inventing a structure the text has not got; a note is resolved once every part of
// it is either done since or standing as a TODO row of its own.
export type UnfinishedState = "none" | "open" | "resolved";

export function unfinishedState(item: TodoItem): UnfinishedState {
  if (item.unfinished === null) {
    return "none";
  }

  return item.unfinishedResolvedAt === null ? "open" : "resolved";
}

// What a row's outstanding note reads as, or null where there is none to read. A resolved one is still on
// the row and still says what was left; it is no longer one of the leftovers, and that is the
// difference the word carries.
export function unfinishedLabel(t: Translate, item: TodoItem): string | null {
  const state = unfinishedState(item);

  if (state === "none") {
    return null;
  }

  return state === "open" ? t("todo.label.unfinished_open") : t("todo.label.unfinished_resolved");
}

// Whether this row has an outstanding note to resolve. One already resolved is not resolved again, and an
// item that left none has nothing to resolve — the bot refuses both, and the button is not
// offered for either.
export function canResolve(item: TodoItem): boolean {
  return unfinishedState(item) === "open";
}

// Whether the owner can stop the item now: something of it is in flight — a run, an order under way, or
// an order stopped and waiting its turn — and it is not already his stop. A plain hold whose run
// still goes can be turned into one, since the hold alone lets that run finish.
export function canStop(item: TodoItem): boolean {
  return !item.done && item.heldKind !== "stop" && (item.running || item.orderActive || item.stopped !== null);
}

// The line a merged item carries: which item it was merged into, and since when. A finished one
// says it was finished with that item, which is where the account of its work is.
export function mergedLine(t: Translate, item: TodoItem, formatStamp: (at: number) => string): string | null {
  if (item.mergedInto === null) {
    return null;
  }

  const target = `#${item.mergedInto}${item.mergedIntoTitle === null ? "" : ` ${item.mergedIntoTitle}`}`;

  if (item.mergedAt === null) {
    return item.done ? t("todo.label.merged_done", { target }) : t("todo.label.merged_open", { target });
  }

  const since = formatStamp(item.mergedAt);

  return item.done ? t("todo.label.merged_done_since", { since, target }) : t("todo.label.merged_open_since", { since, target });
}

// The line a held item carries: since when, as which kind, and why.
export function heldLine(t: Translate, item: TodoItem, formatStamp: (at: number) => string): string | null {
  if (item.heldAt === null) {
    return null;
  }

  const kind = heldLabel(t, item.heldKind, false);
  const since = formatStamp(item.heldAt);

  return item.heldReason === null
    ? t("todo.label.held_since", { since, kind })
    : t("todo.label.held_since_reason", { since, kind, reason: item.heldReason });
}

export function filterLabel(t: Translate, filter: TodoFilter): string {
  return filter === "all" ? t("common.label.all") : t(STATE_LABELS[filter]);
}

export function todoFilters(): TodoFilter[] {
  return [...FILTERS];
}

export function isTodoFilter(value: unknown): value is TodoFilter {
  return typeof value === "string" && (FILTERS as readonly string[]).includes(value);
}

// How many conditions are set.
export function conditionCount(conditions: TodoConditions): number {
  return CONDITION_KEYS.filter((key) => conditions[key] !== null).length;
}

// The conditions out of anything that claims to be them — a stored view or a request's query —
// with whatever is not one of their values dropped rather than trusted.
export function conditionsOf(value: unknown): TodoConditions {
  const held = value === null || typeof value !== "object" ? {} : (value as Record<string, unknown>);
  const text = (raw: unknown): string | null => (typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null);
  const unfinished = text(held.unfinished);
  const chat = text(held.chat);

  return {
    worker: text(held.worker),
    unfinished: unfinished === "open" || unfinished === "resolved" ? unfinished : null,
    chat: chat === NO_ROOM || (chat !== null && /^-?\d+$/.test(chat)) ? chat : null,
    requester: text(held.requester)
  };
}

// The conditions as a request's query carries them: only the ones that are set.
export function conditionQuery(conditions: TodoConditions): Record<string, string> {
  return Object.fromEntries(
    CONDITION_KEYS.flatMap((key) => (conditions[key] === null ? [] : [[key, conditions[key] as string]]))
  );
}

// The order they stand in: what waits on the owner first, because it is the only part that
// asks anything of him; then the queue itself; then what was lately done. A filter drops the
// sections whose state it does not name, so what is left is only what he asked to see.
//
// The queue's own order is the pin and then the owner's numbering: a row a job is going on for
// stands at the head, and under it the rest by priority and then by item number.
//
// An item that is reporting is done, so the archive hands it over among the finished; here it
// is lifted back into the queue. Its run is still going and the row must not move out from
// under whoever is watching it — it goes on standing where its priority puts it, which is where
// it stood all the while it ran, and no pin lifts it.
// The sections of the board, in the order they stand in: what waits on the owner, the queue, what
// is set aside, what another row carried, and what is finished. What each is called and what it
// says when it is empty is settled here, because the panel stands the same titles whether the rows
// have arrived or not.
//
// `waiting` is how many placeholders stand under a title while the board is still being read. It is
// what that section ordinarily holds rather than a guess at the answer: a placeholder run longer
// than the rows that land leaves the panel to collapse under the reader.
const SECTIONS: { key: TodoSection["key"]; label: string; empty: string; waiting: number }[] = [
  { key: "pending", label: "todo.title.section_pending", empty: "todo.message.section_pending_empty", waiting: 1 },
  { key: "queue", label: "todo.title.section_queue", empty: "todo.message.section_queue_empty", waiting: 3 },
  { key: "held", label: "todo.title.section_held", empty: "todo.message.section_held_empty", waiting: 2 },
  { key: "merged", label: "todo.title.section_merged", empty: "todo.message.section_merged_empty", waiting: 2 },
  { key: "done", label: "todo.title.section_done", empty: "todo.message.section_done_empty", waiting: 3 }
];

// One section's title standing before its rows have arrived, and how many placeholder rows stand
// under it.
export interface TodoWaitingSection {
  key: TodoSection["key"];
  // Null where nothing can be said about which section the rows will fall into, and the run of
  // placeholders stands on its own.
  label: string | null;
  rows: number;
}

// What the panel stands while the board is being read for the first time. A section's title says
// nothing that has to be fetched, so it is drawn at once and only the rows under it are
// placeholders; which titles stand is what the filter already decides.
//
// Under a condition it is the board that decides which sections stand at all, and that cannot be
// known before it arrives. Standing every title and taking most of them away again would move the
// panel under the reader, so one run of placeholders stands unnamed instead.
export function todoWaitingSections(t: Translate, view: TodoView = DEFAULT_VIEW, searching: boolean = false): TodoWaitingSection[] {
  if (conditionCount(view.conditions) > 0) {
    return [{ key: "queue", label: null, rows: 4 }];
  }

  return SECTIONS
    .filter((section) => holdsFilter(section.key, view.filter, searching))
    .map((section) => ({ key: section.key, label: t(section.label), rows: section.waiting }));
}

export function todoSections(
  t: Translate,
  board: TodoBoard,
  view: TodoView = DEFAULT_VIEW,
  now: number = toUnixSeconds(Date.now()),
  // Whether something is being looked for. What is set aside is out of the way by default, but a
  // search is deliberate looking: hiding a row he is searching for would make the search lie
  // about what the table holds.
  searching: boolean = false
): TodoSection[] {
  const reporting = reportingOf(board, now);
  const held: Record<TodoSection["key"], TodoItem[]> = {
    pending: board.pending,
    queue: queueWith(board.queue, reporting, now),
    held: board.held,
    merged: board.merged,
    done: board.done.filter((item) => todoState(item, now) !== "reporting")
  };

  const shown = SECTIONS
    .filter((section) => holdsFilter(section.key, view.filter, searching))
    .map((section) => ({ key: section.key, label: t(section.label), empty: t(section.empty), items: held[section.key] }))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => shownBy(todoState(item, now), view.filter))
    }));

  // Under a condition an empty section is the ordinary case rather than news — an outstanding note is only ever
  // on a finished row — so only the sections that hold something stand.
  return conditionCount(view.conditions) === 0 ? shown : shown.filter((section) => section.items.length > 0);
}

// One stretch of an item's time as a bar shows it: what it is called, what the legend says
// after the clock, how long it was and the colour it is drawn in.
export interface TimeSegment {
  label: string;
  detail: string | null;
  seconds: number;
  color: BarColor;
}

// One bar and what it is a bar of. The max is what the widths are shares of, and it is the
// bar's own rather than the item's: only one of these bars divides the item's time, and a bar
// whose parts overlap says so in its note instead of pretending to a whole.
export interface TimeBar {
  title: string;
  note: string | null;
  max: number;
  segments: TimeSegment[];
}

// How long the item took, as the block beside its account reads it: the whole of the time, how
// many runs went into it, and the bars that break it down.
export interface TodoTime {
  total: string;
  attempts: string | null;
  bars: TimeBar[];
}

// What each phase is drawn in, and the order the phases stand in — the order a job goes
// through them, not the order of their lengths, because a partition read out of sequence is
// harder to read than a list. A phase is the same colour on every item, so the shape of one
// item's bar can be compared with another's at a glance.
// The phases are named by bmo-job as it records them (bmo-job's docs/jobs.md, 「Where a job's time went」): the
// wait for the checkout's lock, getting ready, the run and finishing. The names are data it is matched on,
// each said by the pack's word for it; a phase it does not know stands under its own name, last.
const PHASES: readonly { name: string; color: BarColor; label: string }[] = [
  { name: "wait", color: "neutral", label: "todo.label.phase_wait" },
  { name: "ready", color: "info", label: "todo.label.phase_ready" },
  { name: "agent run", color: "primary", label: "todo.label.phase_run" },
  { name: "finish", color: "success", label: "todo.label.phase_finish" }
];

const PHASE_ORDER = PHASES.map((phase) => phase.name);

// The phase the agent's own run is, which names who ran it where that is known.
const RUN_PHASE = "agent run";

// The colours the inside bar runs through, in order. Nothing here is red: these segments are
// what the work went to, and a red one would read as something having gone wrong.
const INSIDE_COLORS: BarColor[] = ["primary", "info", "success", "warning", "secondary"];

// How many of the things inside the run get a segment of their own. Past this the tail is
// short spans in a panel a few hundred pixels wide, where another colour says less than one
// segment saying how many were folded into it.
const INSIDE_SHOWN = 5;

// A phase whose seconds round to nothing is left out of the legend: it took no time anybody
// can read, and a row saying 0 seconds is a row spent on nothing. Its width stays in the bar's max,
// so the bar goes on being the whole of the item's time.
const READABLE_SECONDS = 0.5;

// How long the item took and what the time went to, for the block that stands under the
// account of it. An item no run has finished has none of this — a nought would read as work
// that took no time — and an item whose runs are older than the keeping of spans has the total
// with no bar under it, which is an answer of its own.
export function todoTimeline(t: Translate, item: TodoItem): TodoTime | null {
  if (item.seconds === null) {
    return null;
  }

  return {
    total: t("todo.label.time_total", { time: spanClock(t, item.seconds) }),
    // Every run of the item is in that total, the ones that failed included, so a total made of
    // more than one says how many it is made of.
    attempts: item.attempts > 1 ? t("todo.label.time_attempts", { n: item.attempts }) : null,
    // A bar with nothing to draw is a title over an empty track, which says less than no bar at
    // all: an item whose every phase rounds under a second has one, and so has one whose inside
    // spans were all answered the instant they were called.
    bars: [phaseBar(t, item.spans, runnerOf(t, item)), insideBar(t, item.spans, runnerOf(t, item))].filter(
      (bar): bar is TimeBar => bar !== null && bar.segments.length > 0 && bar.max > 0
    )
  };
}

// Who ran the item's work and on which road, as the run's phase and the bar inside it name it: its worker — the base
// worker where it names none — and the provider and model its work last went out on; null before any run went out.
function runnerOf(t: Translate, item: TodoItem): string | null {
  const ran = itemRanModel(item.model, item.ranOn);

  if (item.ranOn === null || ran === null) return null;

  return t("todo.label.runner", { worker: item.worker ?? t("todo.label.base_worker"), road: ran.shown });
}

// The bar that divides the item's time: the phases, in the order a job passes through them.
// They are a true partition of what the total counts, so the widths mean exactly what they look
// like and the bar needs no word of warning under it.
function phaseBar(t: Translate, spans: TodoSpan[], runner: string | null): TimeBar | null {
  const phases = spans.filter((span) => span.kind === "phase");

  if (phases.length === 0) {
    return null;
  }

  return {
    title: t("todo.title.time_phases"),
    note: null,
    max: totalSeconds(phases),
    segments: [...phases]
      .sort((left, right) => phaseAt(left.name) - phaseAt(right.name))
      .filter((phase) => phase.seconds >= READABLE_SECONDS)
      .map((phase) => {
        const known = PHASES.find((one) => one.name === phase.name);

        const label = known === undefined ? phase.name : known.name === RUN_PHASE && runner !== null ? t("todo.label.phase_run_by", { runner }) : t(known.label);

        return { ...segment(t, phase, known?.color ?? "neutral"), label };
      })
  };
}

// The bar of what happened inside the run: the tools it called and the branches it opened,
// longest first, with the tail folded into one segment. These ran side by side and each counts
// its own seconds, so they are shares of one another rather than of the job — which is why the
// max is their own sum and why the bar says as much on the screen.
function insideBar(t: Translate, spans: TodoSpan[], runner: string | null): TimeBar | null {
  const inside = shownInside(spans.filter((span) => span.kind !== "phase")).sort(
    (left, right) => right.seconds - left.seconds
  );

  if (inside.length === 0) {
    return null;
  }

  const shown = inside.slice(0, INSIDE_SHOWN);
  const tail = inside.slice(INSIDE_SHOWN);
  const segments = shown.map((span, at) => segment(t, span, INSIDE_COLORS[at % INSIDE_COLORS.length] ?? "primary"));

  if (tail.length > 0) {
    segments.push({ label: t("todo.label.time_rest", { n: tail.length }), detail: null, seconds: totalSeconds(tail), color: "neutral" });
  }

  return {
    title: runner === null ? t("todo.title.time_inside") : t("todo.title.time_inside_by", { runner }),
    note: t("todo.message.time_inside_note"),
    max: totalSeconds(segments),
    segments
  };
}

function segment(t: Translate, span: TodoSpan, color: BarColor): TimeSegment {
  return { label: spanFace(t, span), detail: spanDetail(t, span), seconds: span.seconds, color };
}

// What the legend says after the clock, or nothing where the span has nothing more to say: how
// many calls the seconds are added over, and the tokens for the one kind of span that states
// them.
function spanDetail(t: Translate, span: TodoSpan): string | null {
  const parts = [
    span.times > 1 ? t("todo.label.span_times", { n: span.times }) : null,
    span.tokens === null ? null : t("todo.label.span_tokens", { tokens: tokenText(span.tokens) })
  ].filter((part): part is string => part !== null);

  return parts.length === 0 ? null : parts.join(" · ");
}

// Where a phase stands in the run. A phase this list does not name is one nobody has met, and
// it goes last rather than being dropped: it is still time the item took.
function phaseAt(name: string): number {
  const at = PHASE_ORDER.indexOf(name);

  return at === -1 ? PHASE_ORDER.length : at;
}

function totalSeconds(spans: readonly { seconds: number }[]): number {
  return spans.reduce((sum, span) => sum + span.seconds, 0);
}

// One thing said in the conversation an item was filed from: which side said it, where the words
// came from, and the words.
export interface InstructionEntry {
  label: string;
  source: string;
  text: string;
  reply: boolean;
}

// A part of an item's instruction as the dialog lays it out: one of the parts somebody wrote under
// its own name, the conversation both sides of it, or a stretch that is not a part at all — the
// whole of an instruction older than parts.
export type InstructionPart =
  | { kind: "block"; label: string; source: string; text: string }
  | { kind: "conversation"; title: string; entries: InstructionEntry[] }
  | { kind: "loose"; text: string };

// The instruction in the parts the dialog gives each a place of its own, in the one order an item
// is read in wherever it is read. The names are the instruction's own and nothing is renamed; the
// order is the shared one, so a row written before that order was settled lays out here exactly as
// a row written after it does. The copied messages standing one after another are read as one
// conversation, and the line that heads them becomes that conversation's title instead of a
// paragraph of its own.
// The labels of the blocks bmo-job writes in every item, each said by the pack's word for it; any other
// label is the words of whoever wrote the block and stands as written.
const BLOCK_LABELS: Record<string, string> = {
  [PART_ORDER[0]]: "todo.label.part_what",
  [PART_ORDER[1]]: "todo.label.part_conclusion",
  [PART_ORDER[2]]: "todo.label.part_to_do"
};

function blockLabel(t: Translate, label: string): string {
  const key = BLOCK_LABELS[label];

  return key === undefined ? label : t(key);
}

export function instructionParts(t: Translate, instruction: string): InstructionPart[] {
  const parts: InstructionPart[] = [];
  let talk: { kind: "conversation"; title: string; entries: InstructionEntry[] } | null = null;
  let headed = false;

  for (const segment of orderedSegments(instructionSegments(instruction))) {
    if (segment.label === null) {
      talk = null;

      if (segment.text === CONVERSATION_HEAD) {
        headed = true;
        continue;
      }

      headed = false;
      parts.push({ kind: "loose", text: segment.text });
      continue;
    }

    const reply = segment.label === SAID_LABELS.reply;

    if (reply || segment.label === SAID_LABELS.instruction) {
      if (talk === null) {
        talk = { kind: "conversation", title: "", entries: [] };
        parts.push(talk);
      }

      talk.entries.push({ label: segment.label, source: segment.source, text: segment.text, reply });
      talk.title = headed || talk.entries.some((entry) => entry.reply) ? t("todo.title.conversation") : t("todo.title.instruction_as_said");
      continue;
    }

    talk = null;
    headed = false;
    parts.push({ kind: "block", label: blockLabel(t, segment.label), source: segment.source, text: segment.text });
  }

  return parts;
}

// A part's source line as the console reads it. The instruction stamps each message in UTC so the
// record means one thing wherever it is read; on this screen every other moment is Seoul's, so
// the stamp is drawn the way the rest are.
export function readableSource(source: string): string {
  return source.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (stamp) =>
    formatStamp(toUnixSeconds(Date.parse(stamp)))
  );
}

// What the job record says where the time bars have nothing to draw yet: the run that is going,
// counted among the runs, or that no job has run at all. A place that stays blank says nothing,
// and the reader cannot tell a record that is empty from one that failed to load.
export function jobRecordLine(t: Translate, item: TodoItem): string | null {
  if (item.running) {
    return t("todo.status.running_attempt", { n: item.attempts });
  }

  return item.seconds === null ? t("todo.status.no_job_yet") : null;
}

// Where the item stands on approval, in the words the dialog's head line uses.
export function approvalLabel(t: Translate, item: TodoItem): string {
  if (item.awaitingApproval) return item.recommended ? t("todo.label.recommended_awaiting") : t("todo.label.not_approved");

  return item.approved ? t("todo.label.approved") : t("todo.label.opened_unattended");
}

// One approval of an item, as its record reads it: its kind — an approver's approval or the chat agent's
// recommendation — and the caller whose token gave it (docs/web.md, the TODO modal's approval record).
export function approvalChangeLine(t: Translate, change: TodoApproval): string {
  const kind = change.kind === "approval" ? t("todo.label.approval_given") : t("todo.label.approval_recommended");
  const caller = change.caller === null ? t("todo.label.approval_no_caller") : t("todo.label.approval_by_person", { name: change.caller });

  return `${kind} · ${caller}`;
}

// The mark a record line wears beside its words: the check the row's own verb gives an approval with, and a
// thumb for a recommendation, which is not one.
export function approvalChangeIcon(change: TodoApproval): string {
  return change.kind === "approval" ? "i-material-symbols-check" : "i-material-symbols-thumb-up-outline";
}

// Where a request came from, for a row waiting on the owner: the room and the person who asked.
export function requesterLine(item: TodoItem, rooms: RoomSummary[]): string {
  const room = rooms.find((candidate) => candidate.chatId === item.chatId);
  const where = item.chatId === null ? null : (room?.title ?? String(item.chatId));

  return where === null ? item.requester : `${where} · ${item.requester}`;
}

// Whether an item can go further in that direction: the first of the queue cannot go up and
// the last cannot go down, and nothing outside the queue moves at all.
export function canMove(queue: TodoItem[], id: number, direction: "up" | "down"): boolean {
  const at = queue.findIndex((item) => item.id === id);

  if (at === -1) {
    return false;
  }

  return direction === "up" ? at > 0 : at < queue.length - 1;
}

// Whether sending it to the front would move it at all: the one already standing there has
// nowhere to go, and neither has an item that is not in the queue.
export function canTop(queue: TodoItem[], id: number): boolean {
  return canMove(queue, id, "up");
}

// What a row's own menu offers, in the order it stands them (docs/web.md, the TODO panel's section): the
// running job's log, then each act the row's state allows, the same acts the opened item allows. A
// finished or merged row is acted on by nobody, so it offers nothing and opens no menu.
export type RowVerb = "log" | "approve" | "unapprove" | "hold" | "release" | "top" | "done" | "append" | "drop";

export function rowVerbs(item: TodoItem, queue: TodoItem[], now: number = toUnixSeconds(Date.now())): RowVerb[] {
  const state = todoState(item, now);

  if (state === "done" || state === "reporting" || state === "merged") {
    return [];
  }

  const held = item.heldAt !== null;
  // A request waiting on him, or a row set aside, is still his to approve or throw out; an approved
  // one is his to move or take the approval back from.
  const deciding = held || state === "pending";
  // Its job's log stands while one runs, and once the job ended with its commit still on its way live; a line no
  // job ever ran for has none to open.
  const verbs: RowVerb[] = item.running || item.closing !== null ? ["log"] : [];

  if (state === "pending") verbs.push("approve");
  verbs.push(held ? "release" : "hold");
  if (!deciding && canTop(queue, item.id)) verbs.push("top");
  // A job still at work closes the item itself, and a row wound down or stopped is work he means
  // to have resumed: the bot refuses closing either.
  if (!item.running && !jobGoingOn(state) && item.heldKind !== "pause" && item.heldKind !== "stop") verbs.push("done");
  verbs.push("append");
  // What takes something away comes last: the approval from an approved row, the row itself from
  // one still his to decide or one that opened by itself with no approval to take back.
  verbs.push(!deciding && item.approved ? "unapprove" : "drop");

  return verbs;
}

// Whether sending it to the back would move it at all: the last of the queue is already there.
export function canBottom(queue: TodoItem[], id: number): boolean {
  return canMove(queue, id, "down");
}

// What a press sends beside its verb and the item: the direction of a move, the note an approval
// carries, the reason for a hold, a stop or a resolution, the worker assigned, or whether the item
// runs as a co-work. A verb sends only the field it has.
export interface TodoActFields {
  direction?: "up" | "down";
  note?: string;
  why?: string;
  worker?: string | null;
  model?: string;
  role?: string;
  agent?: string;
}

// Which one button is waiting, in the one name the panel holds it under. A press belongs to the
// item, the verb and the direction together: approve and save-comment are the same verb under two
// labels and never stand at once, while up and down are one verb in two directions and do
// stand at once, so the direction is part of the name and the label is not.
export function busyKey(id: number, action: TodoAction, direction?: "up" | "down"): string {
  return `${id}:${action}:${direction ?? ""}`;
}

// Whether one of the presses now running keeps this button from being pressed. Each button waits
// on its own, so an arrow and a save on one row, or the same button on two rows, run side by side
// and neither is held. The one press that cannot be taken back is what is kept apart: discard
// takes the item off the table outright, so it is not offered while anything else on its row is
// running, and nothing else on that row is offered while it runs. Nothing further is held — a row
// holds back its own buttons and no other row's.
export function busyBlocks(busy: ReadonlySet<string>, id: number, action: TodoAction): boolean {
  const dropping = busyKey(id, "drop");

  if (action !== "drop") {
    return busy.has(dropping);
  }

  return [...busy].some((key) => key !== dropping && rowOf(key) === id);
}

// Which rows carry a drag handle: one that is waiting in the queue and nothing else. A row a
// job is going on for has already been launched, so where it stands decides nothing any more and
// the pin is what stands it where it stands; a row wearing reporting is finished and only
// standing in the queue while its report goes out; and a finished row or one waiting on the
// owner is not in the queue at all, an unapproved request having no place in the order until he
// approves it.
export function canDrag(
  item: TodoItem,
  view: TodoView = DEFAULT_VIEW,
  now: number = toUnixSeconds(Date.now()),
  searching: boolean = false
): boolean {
  return !dragBlocked(view, searching) && todoState(item, now) === "waiting";
}

// Whether the handles are taken away. Dragging saves the whole queue in the order its rows stand
// in, so it is offered only where every row an order could move is on the screen. The waiting tab
// hides only rows no order moves — the running one the pin holds at the front, and one that is
// only reporting — so it drags like the whole list; any other tab, a condition or a search hides
// waiting rows in between, and a saved order would move rows nobody could see.
export function dragBlocked(view: TodoView, searching: boolean = false): boolean {
  return (view.filter !== "all" && view.filter !== "waiting") || conditionCount(view.conditions) > 0 || searching;
}

// The whole queue section as the order is saved from, whatever tab is showing: the rows a tab hides
// are still part of the order the bot is asked to write.
export function queueSection(board: TodoBoard, now: number = toUnixSeconds(Date.now())): TodoItem[] {
  return queueWith(board.queue, reportingOf(board, now), now);
}

// How near an edge a held row has to come before the list creeps, and how far it creeps in one
// step at the very edge. A queue longer than the panel is moved through by carrying a row to the
// edge and waiting, which is what a list does under a drag anywhere else.
export const EDGE_BAND_PX = 56;
export const EDGE_STEP_PX = 14;
export const EDGE_STEP_MS = 16;

// How far the list should creep in one step while a row is held at that height: nothing while
// the row is being carried through the middle, a step up or down that grows as the edge is
// neared, and the whole step where the pointer has left the list altogether.
export function edgeScrollStep(box: { top: number; bottom: number }, y: number): number {
  const above = y - box.top;
  const below = box.bottom - y;

  if (above < EDGE_BAND_PX) {
    return -step(above);
  }

  if (below < EDGE_BAND_PX) {
    return step(below);
  }

  return 0;
}

function step(near: number): number {
  return Math.max(1, Math.round(EDGE_STEP_PX * (1 - Math.max(0, near) / EDGE_BAND_PX)));
}

// The queue's ids in the order a drop leaves them in: dragging a row up puts it ahead of the row
// it was dropped on, dragging it down puts it behind that row, and dropping it on itself moves
// nothing. The pin is applied last, so a row aimed at the pinned one, or anywhere above it,
// lands directly under it — the topmost place a waiting row can hold — and the order that goes
// to the bot is the order the section will stand the rows up in.
export function reorderedQueue(
  rows: TodoItem[],
  draggedId: number,
  overId: number,
  now: number = toUnixSeconds(Date.now())
): number[] {
  const from = rows.findIndex((row) => row.id === draggedId);
  const to = rows.findIndex((row) => row.id === overId);

  if (from === -1 || to === -1 || from === to) {
    return queueOrder(rows, now);
  }

  const dragged = rows.filter((row) => row.id === draggedId);
  const rest = rows.filter((row) => row.id !== draggedId);
  const at = rest.findIndex((row) => row.id === overId);

  return queueOrder(
    from < to
      ? [...rest.slice(0, at + 1), ...dragged, ...rest.slice(at + 1)]
      : [...rest.slice(0, at), ...dragged, ...rest.slice(at)],
    now
  );
}

// The ids the bot is asked to write, read off rows standing in some order of their own: the pin
// first, and what is only reporting left out — that row stands in the section but is finished,
// so it is no part of the bot's open queue.
export function queueOrder(rows: TodoItem[], now: number = toUnixSeconds(Date.now())): number[] {
  return openOf(pinned(rows, now));
}

// The board as it stands once that order is written: the queue numbered from the front, which
// is what the bot writes over it. Nothing outside the open queue is touched, so a row that is
// only reporting keeps the number it had and the place that number gives it.
export function boardInOrder(board: TodoBoard, order: number[]): TodoBoard {
  const places = new Map(order.map((id, at) => [id, at + 1]));

  return {
    ...board,
    queue: board.queue
      .map((item) => ({ ...item, priority: places.get(item.id) ?? item.priority }))
      .sort((left, right) => left.priority - right.priority || left.id - right.id)
  };
}

// What the folded panel's strip says at a glance. It counts what the queue section is showing, so
// an item that is reporting is counted there as long as it stands there.
// It counts the whole queue, not what a search or a condition left on the screen: the strip says
// how the queue stands.
export function todoSummary(t: Translate, board: TodoBoard, now: number = toUnixSeconds(Date.now())): string {
  const waiting = board.standing.pending;
  const queue = board.standing.queue + reportingOf(board, now).length;
  // What is set aside is counted in the header even though its rows are not shown. Out of the
  // way is the point of it; forgotten is not, and a number he can see is what keeps the two
  // apart.
  const parts = [t("todo.label.summary_queue", { n: queue })];

  if (waiting > 0) {
    parts.push(t("todo.label.summary_pending", { n: waiting }));
  }

  if (board.standing.held > 0) {
    parts.push(t("todo.label.summary_held", { n: board.standing.held }));
  }

  if (board.standing.merged > 0) {
    parts.push(t("todo.label.summary_merged", { n: board.standing.merged }));
  }

  return parts.join(" · ");
}

// The count a state tab carries as its badge, out of the whole table rather than what a search or
// a condition left on the screen, or null for a tab that carries none: all is the sum of the
// rest and done only ever grows. The queue splits between waiting and running, and a row that is
// reporting is counted under running as the tab shows it.
export function filterCount(board: TodoBoard, filter: TodoFilter, now: number = toUnixSeconds(Date.now())): number | null {
  const standing = board.standing;

  switch (filter) {
    case "waiting":
      return standing.queue - standing.running;
    case "running":
      return standing.running + reportingOf(board, now).length;
    case "pending":
      return standing.pending;
    case "held":
      return standing.held;
    case "merged":
      return standing.merged;
    default:
      return null;
  }
}

// The panel is dragged by its edge, and a width outside these bounds is not one it takes.
export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return PANEL_DEFAULT_WIDTH;
  }

  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

// Which row a press's name belongs to. The name is this module's own, so it is read back here.
function rowOf(key: string): number {
  return Number(key.slice(0, key.indexOf(":")));
}

// The ids of the rows the bot's own queue holds: what is finished stands in the section while
// its report goes out, but the queue itself is the unfinished ones.
function openOf(rows: TodoItem[]): number[] {
  return rows.filter((row) => !row.done).map((row) => row.id);
}

// The finished items whose run is still writing its report.
function reportingOf(board: TodoBoard, now: number): TodoItem[] {
  return board.done.filter((item) => todoState(item, now) === "reporting");
}

// The queue with the reporting items standing back in it, each where its own priority puts it,
// and the pin over the whole of it. The archive's own order is priority then id, and the sort is
// stable, so every row that was already in the queue stays exactly where the archive handed it
// over, only under whatever the pin lifts.
function queueWith(queue: TodoItem[], reporting: TodoItem[], now: number): TodoItem[] {
  if (reporting.length === 0) {
    return pinned(queue, now);
  }

  return pinned(
    [...queue, ...reporting].sort((left, right) => left.priority - right.priority || left.id - right.id),
    now
  );
}

// The one pin, and the section and a drop's saved order both come through it, so the list shown
// and the list saved cannot be two lists: a row a job is going on for stands at the head, and
// everything under it keeps the order it came in with — the owner's numbering where the section
// stands the rows up, the drop's own arrangement where a row has just been let go of. A row
// wearing reporting is lifted with them: its job has not ended, and a row that dropped back to its
// number the moment the job marked it done would jump down the list while the job still runs.
//
// The pin is in the order itself rather than laid over the display, because what a drop saves is
// the rows as they stand on the screen. A pin the saved order could not say would put a row at a
// place that means nothing in stored terms, and then the screen would no longer be what gets
// saved — which is the very thing the hidden handles under a filter are for.
function pinned(rows: TodoItem[], now: number): TodoItem[] {
  const going = (row: TodoItem): boolean => jobGoingOn(todoState(row, now));
  const running = rows.filter(going);

  if (running.length === 0) {
    return rows;
  }

  return [...running, ...rows.filter((row) => !going(row))];
}

// Which sections a filter leaves standing: the state a section holds is the state it is named
// for, and the queue holds both of the unfinished ones.
function holdsFilter(key: TodoSection["key"], filter: TodoFilter, searching: boolean): boolean {
  // What is set aside stays out of the way of every other view. It is the whole of what setting
  // one aside is for: he asked not to see them. It is one press away under its own chip, and a
  // search reaches it too, so nothing is ever lost by holding it.
  if (key === "held") {
    return filter === "held" || searching;
  }

  // What is merged is out of the way the same way: its work is carried by another row.
  if (key === "merged") {
    return filter === "merged" || searching;
  }

  if (filter === "all") {
    return true;
  }

  if (key === "queue") {
    return filter === "waiting" || filter === "running";
  }

  return key === filter;
}

// Whether a filter shows a row in this state. A row a job is still going on for is running.
function shownBy(state: TodoState, filter: TodoFilter): boolean {
  return filter === "all" || state === filter || (filter === "running" && jobGoingOn(state));
}

// How far back the finished list currently reaches, and how far the next read should. The panel
// asks for the whole run it has scrolled through rather than for the next page alone: one answer
// from the archive is always consistent with itself, where a stack of pages can skip a row or
// show one twice when something is marked done between two of them.
export function nextDoneLimit(shown: number, total: number): number | null {
  return shown >= total ? null : Math.min(total, Math.max(shown, 0) + DONE_PAGE_SIZE);
}

// What a re-read asks for when news arrives rather than when he scrolls. It is what he already
// has, rounded up to a whole page, so a refresh never takes back the rows he scrolled down to.
export function keptDoneLimit(shown: number): number {
  return Math.max(DONE_PAGE_SIZE, Math.ceil(shown / DONE_PAGE_SIZE) * DONE_PAGE_SIZE);
}

// The line under the finished list. It says where the list ends and why: everything there is,
// everything that matched, or nothing that matched at all. A list still being scrolled says
// nothing, because the next page is on its way.
export function doneTail(t: Translate, input: { shown: number; total: number; searching: boolean }): string | null {
  if (input.shown < input.total) {
    return null;
  }

  // A list with nothing in it already says so in the section's own empty line.
  if (input.total === 0) {
    return null;
  }

  return input.searching
    ? t("todo.message.done_all_found", { n: input.total })
    : t("todo.message.done_all_loaded", { n: input.total });
}

// What the whole search found, counted across the three lists, for the line above them. A search
// that found nothing anywhere says so once rather than three times over.
// Every text one row carries for the search: what the row shows, in the words it shows them, and
// what the item holds that the row does not. The server filters with this and the panel marks the
// hits with it, so the two can never disagree about why a row was found.
function modelSearchText(item: TodoItem): string | null {
  const short = itemModel(item);
  const whole = itemModel(item, true);

  return short === null ? null : short === whole ? short : `${short} ${whole}`;
}

export function todoSearchFields(
  t: Translate,
  item: TodoItem,
  rooms: RoomSummary[],
  now: number = toUnixSeconds(Date.now())
): SearchField[] {
  const pending = todoState(item, now) === "pending";

  return [
    { label: t("todo.label.field_id"), text: `#${item.id}`, shown: true },
    { label: t("todo.label.field_title"), text: item.title, shown: true },
    { label: t("todo.label.field_state"), text: stateLabel(t, item, now), shown: true },
    // The model the row's chip shows short, found by its whole name as well, which its tooltip shows.
    { label: t("todo.label.field_model"), text: modelSearchText(item), shown: true },
    { label: t("todo.label.field_worker"), text: item.worker, shown: true },
    { label: t("todo.label.field_unfinished"), text: unfinishedLabel(t, item), shown: true },
    { label: t("todo.label.field_requester"), text: pending ? requesterLine(item, rooms) : item.requester, shown: pending },
    { label: t("todo.label.field_stopped"), text: stoppedLine(t, item), shown: true },
    { label: t("todo.label.field_waiting"), text: waitingLine(t, item, now), shown: true },
    { label: t("todo.label.field_deploy_waits"), text: deployWaitsLine(t, item), shown: true },
    { label: t("todo.label.field_merged"), text: item.mergedInto === null ? null : t("todo.label.field_merged_into", { id: item.mergedInto }), shown: true },
    {
      label: t("todo.label.field_checkout"),
      text: item.holding === null ? null : t("todo.label.field_checkout_reason", { reason: item.holding }),
      shown: true
    },
    { label: t("todo.label.field_instruction"), text: item.instruction, shown: false },
    { label: t("todo.label.field_report"), text: item.reports.length === 0 ? null : item.reports.map((report) => report.body).join("\n\n"), shown: false },
    { label: t("todo.label.field_unfinished"), text: item.unfinished, shown: false },
    { label: t("todo.label.field_note"), text: item.note, shown: false }
  ];
}

export function searchTally(t: Translate, board: TodoBoard): string {
  const total = board.queue.length + board.pending.length + board.held.length + board.merged.length + board.doneTotal;

  return total === 0 ? t("todo.message.search_none") : t("todo.message.search_found", { n: total });
}
