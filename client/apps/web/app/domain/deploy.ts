import { countText } from "./numbers";
import { formatClock, spanClock } from "bmo-ui/app/domain/time";

import type { DeployCommit, DeployHold, DeployRunView, DeployView, DeployWaiting, TodoBoard, TodoItem, WaitingCommit } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { DeployPart, DeployStage, DeployStep, DeployStepAhead } from "#shared/deploy-progress";

// The deployment mark of the title bar (docs/web.md, 「Deployment in the title bar」): which of its
// states stands, in what words and colour. The screen draws it; what it says is decided here, once.

/** How long an ended run stays on the bar. */
export const ENDING_SHOWN_MS = 120_000;

/**
 * The deploy icon a page older than the console wears, on the mark and on the popover's reload button. It trades
 * places with the running mark's spinner, so it is never a circular arrow.
 */
export const DEPLOY_ICON = "i-material-symbols-deployed-code-update-outline";

/** Which state the mark stands in: a run under way, the hold, deployments waiting in the line, a run just ended, or a
 * page older than the console. */
export type DeployMarkKind = "running" | "hold" | "line" | "ended" | "newer";

export type DeployTone = "neutral" | "warning" | "success" | "error" | "primary" | "info";

export interface DeployMark {
  kind: DeployMarkKind;
  tone: DeployTone;
  icon: string;
  spin: boolean;
  label: string;
  /** What stands after the label on a wide bar and in the tooltip: the stage and the time, the jobs waited for, the reason. */
  detail: string;
}

const STAGE_KEYS: Record<DeployStage, string> = {
  check: "deploy.label.stage_check",
  backup: "deploy.label.stage_backup",
  tree: "deploy.label.stage_tree",
  build: "deploy.label.stage_build",
  before: "deploy.label.stage_before",
  restart: "deploy.label.stage_restart",
  "stay-up": "deploy.label.stage_stay_up",
  after: "deploy.label.stage_after",
  rollback: "deploy.label.stage_rollback",
};

const PART_KEYS: Record<DeployPart, string> = {
  snapshot: "deploy.label.part_snapshot",
  pack: "deploy.label.part_pack",
  check: "deploy.label.part_check",
};

export function stageLabel(t: Translate, stage: DeployStage | null): string {
  return stage === null ? t("deploy.label.stage_starting") : t(STAGE_KEYS[stage]);
}

/** The stage a run stands at: the last it reached, or none before its first. */
export function currentStage(run: DeployRunView): DeployStage | null {
  return run.stages.at(-1)?.stage ?? null;
}

/** What a step under its stage is called: a part of its stage by the part alone, any other step by the name it was written under. */
export function stepLabel(t: Translate, step: DeployStepAhead): string {
  return step.part === undefined ? step.name : t(PART_KEYS[step.part]);
}

/** One stage passed so far, with how long it took and each heavy step that ended in it. */
export interface StageSpan {
  stage: DeployStage;
  at: number;
  seconds: number;
  current: boolean;
  steps: DeployStep[];
}

/**
 * How long each stage passed so far took, the last one up to the run's end or to now, with the heavy
 * steps that ended in it: by the stage a step was written under, or where it names none, by when it
 * ended, one ended before the first stage going under the first.
 */
export function stageSpans(run: DeployRunView, now: number): StageSpan[] {
  return run.stages.map((one, index) => {
    const nextStage = run.stages[index + 1]?.at;
    const next = nextStage ?? run.endedAt ?? now;
    const steps = run.steps.filter((step) =>
      step.stage === undefined
        ? (index === 0 || step.at >= one.at) && (nextStage === undefined || step.at < nextStage)
        : step.stage === one.stage && step.at >= one.at && step.at <= next
    );

    return { stage: one.stage, at: one.at, seconds: Math.max(0, (next - one.at) / 1000), current: index === run.stages.length - 1 && run.phase === "running", steps };
  });
}

/** Where a stage or a step stands: passed, under way, or still to come. */
export type ProgressState = "done" | "current" | "ahead";

/** One heavy step as the popover lists it under its stage. */
export interface StepRow {
  /** Lasting across its states, so a step still to come, under way and ended is one row. */
  key: string;
  step: DeployStepAhead;
  state: ProgressState;
  /** How long it took, its wait for the turn and its run together, or how long it has gone on; null for one still to come. */
  seconds: number | null;
  /** A failed step's exit code; null otherwise. */
  code: number | null;
}

/** One stage as the popover lists it, with its steps. */
export interface StageRow {
  /** Lasting across its states, so a stage still to come, under way and passed is one row. */
  key: string;
  stage: DeployStage;
  state: ProgressState;
  /** How long it took or has gone on; null for one still to come. */
  seconds: number | null;
  steps: StepRow[];
}

// A row's key by its name and how many rows before it in the same list bear that name, so a row
// keeps its key as it moves from still to come, to under way, to passed.
function keyed<Row>(rows: Row[], name: (row: Row) => string): (Row & { key: string })[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const named = name(row);
    const count = seen.get(named) ?? 0;

    seen.set(named, count + 1);

    return { ...row, key: `${named}#${count}` };
  });
}

/**
 * The planned stages still to come: those of the plan after the stage the run stands at, or the whole
 * plan before its first. A stage passed is not one still to come, and a stage outside the plan — the
 * rollback — has none planned after it.
 */
export function stagesAhead(run: DeployRunView): DeployStage[] {
  const at = currentStage(run);
  const from = at === null ? 0 : run.plan.indexOf(at) + 1;

  if (at !== null && from === 0) return [];

  const passed = new Set(run.stages.map((one) => one.stage));

  return run.plan.slice(from).filter((stage) => !passed.has(stage));
}

// The steps of the stage under way: the one running, its time from when it began, then those still to come.
function stepsGoing(run: DeployRunView, now: number): Omit<StepRow, "key">[] {
  const running: Omit<StepRow, "key">[] = run.running === null ? [] : [{ step: run.running, state: "current", seconds: Math.max(0, (now - run.running.at) / 1000), code: null }];

  return [...running, ...run.ahead.map((step): Omit<StepRow, "key"> => ({ step, state: "ahead", seconds: null, code: null }))];
}

/**
 * Every stage of the run as the popover lists it (docs/web.md, 「Deployment in the title bar」): those
 * passed with how long each took, the one under way with its time so far, and while the run goes, the
 * planned ones still to come. Under each, its steps the same three ways, an ended one's time its wait
 * and its run together, so the steps of the stage under way add up to its time.
 */
export function stageRows(run: DeployRunView, now: number): StageRow[] {
  const passed = stageSpans(run, now).map((span) => {
    const ended = span.steps.map((step): Omit<StepRow, "key"> => ({ step, state: "done", seconds: step.waitedSeconds + step.ranSeconds, code: step.code === 0 ? null : step.code }));
    const steps = keyed([...ended, ...(span.current ? stepsGoing(run, now) : [])], (row) => `${row.step.name}|${row.step.part ?? ""}`);

    return { stage: span.stage, state: span.current ? "current" : "done", seconds: span.seconds, steps } satisfies Omit<StageRow, "key">;
  });
  const ahead = run.phase === "running" ? stagesAhead(run).map((stage) => ({ stage, state: "ahead", seconds: null, steps: [] }) satisfies Omit<StageRow, "key">) : [];

  return keyed([...passed, ...ahead], (row) => row.stage);
}

// What the mark says after the run's state: the unit whose run it is, where the reader is told it, then the rest.
function runDetail(run: DeployRunView, ...rest: string[]): string {
  return [run.unitName ?? "", ...rest].filter((part) => part !== "").join(" · ");
}

// The exit code the testbed ends a heavy step with where it wrote nothing for its silence limit and was ended as hung
// (the testbed's docs/deploy.md, 「What a deployment says of itself as it runs」).
const HUNG_EXIT_CODE = 124;

// How a failed heavy step ended: hung, or with its exit code.
function stepFailure(t: Translate, step: DeployStep): string {
  if (step.code === HUNG_EXIT_CODE) return t("deploy.label.step_hung", { step: stepLabel(t, step) });

  return t("deploy.label.step_failed", { step: stepLabel(t, step), code: step.code });
}

// What the mark says of a failed run after its unit: the stage it failed at, the last it reached short of its
// rollback, and why, where a heavy step of that stage failed it: the last such step and how it ended. A stage that
// failed outside any step, as a service that did not come up does, stands alone.
function failedDetail(t: Translate, run: DeployRunView): string {
  const span = stageSpans(run, run.endedAt ?? Date.now()).findLast((one) => one.stage !== "rollback");
  const step = span?.steps.findLast((one) => one.code !== 0);

  return runDetail(run, stageLabel(t, span?.stage ?? null), step === undefined ? "" : stepFailure(t, step));
}

function endedMark(t: Translate, run: DeployRunView): DeployMark {
  switch (run.end) {
    case "live":
      return { kind: "ended", tone: "success", icon: "i-material-symbols-check-circle-outline", spin: false, label: t("deploy.status.live"), detail: runDetail(run) };
    case "rolled-back":
      return { kind: "ended", tone: "error", icon: "i-material-symbols-undo", spin: false, label: t("deploy.status.rolled_back"), detail: failedDetail(t, run) };
    case "refused":
      return { kind: "ended", tone: "warning", icon: "i-material-symbols-do-not-disturb-on-outline", spin: false, label: t("deploy.status.refused"), detail: runDetail(run) };
    case "withdrawn":
      return { kind: "ended", tone: "neutral", icon: "i-material-symbols-stop-circle-outline", spin: false, label: t("deploy.status.withdrawn"), detail: runDetail(run, stageLabel(t, currentStage(run))) };
    default:
      return { kind: "ended", tone: "error", icon: "i-material-symbols-error-outline", spin: false, label: t("deploy.status.failed"), detail: failedDetail(t, run) };
  }
}

// What the deployment's hold waits on, in the words a reader takes it by (docs/web.md, 「Deployment in the
// title bar」): the items whose Jobs must end before the batch goes up — "goes up when #1389 ends" — or how many
// Jobs where their items could not be read. The time it gives up at is not a time the deployment ends,
// so it stands only in the popover, said as the limit it is (holdLimit).
export function holdWaits(t: Translate, hold: DeployHold): string {
  if (hold.waitingFor !== null && hold.waitingFor.length > 0) {
    return t("todo.status.deploy_hold_after", { items: hold.waitingFor.map((item) => `#${item}`).join(", ") });
  }

  if (hold.waitingOn === null) {
    return t("todo.status.deploy_hold_jobs_unread");
  }

  return hold.waitingOn.length === 0 ? t("todo.status.deploy_hold_no_jobs") : t("todo.status.deploy_hold_jobs", { n: countText(hold.waitingOn.length) });
}

// What the line says after its state: the first in the line, and how many stand behind it.
export function lineWaits(t: Translate, line: readonly DeployWaiting[]): string {
  const first = line[0]?.unitName ?? "";

  return line.length > 1 ? t("deploy.label.line_more", { unit: first, n: countText(line.length - 1) }) : first;
}

/** The run that stands in the popover: one under way, or one ended within the two minutes its end stands. */
export function standingRun(view: DeployView | null | undefined, now: number): DeployRunView | null {
  const run = view?.run ?? null;

  if (run === null) return null;

  return run.phase === "running" || (run.endedAt !== null && now - run.endedAt < ENDING_SHOWN_MS) ? run : null;
}

// The hold's limit as the clock time it falls at: what happens then, rather than how long is left.
export function holdLimit(t: Translate, hold: DeployHold): string {
  return t("todo.status.deploy_hold_limit", { time: formatClock(hold.until) });
}

/**
 * The mark the bar stands, or null where it stands none. A run under way comes first, then the hold, then the
 * deployments waiting in the line, then a run that ended within the last two minutes, then a page older than the
 * console it was read from. Times are milliseconds.
 */
export function deployMarkOf(t: Translate, view: DeployView | null, pageRelease: string, now: number): DeployMark | null {
  if (view === null) return null;

  const run = view.run;

  if (view.hold !== null && (run === null || run.phase !== "running")) {
    return {
      kind: "hold",
      tone: "warning",
      icon: "i-material-symbols-hourglass-top",
      spin: false,
      label: t("deploy.status.hold"),
      detail: holdWaits(t, view.hold),
    };
  }

  // A member is handed no run, so only the administrator's bar stands one.
  if (run !== null && run.phase === "running" && view.detailed) {
    const elapsed = spanClock(t, (now - run.startedAt) / 1000);

    return { kind: "running", tone: "primary", icon: "i-material-symbols-progress-activity", spin: true, label: t("deploy.status.running"), detail: runDetail(run, stageLabel(t, currentStage(run)), elapsed) };
  }

  const line = view.line ?? [];

  if (line.length > 0 && view.detailed) {
    return { kind: "line", tone: "info", icon: "i-material-symbols-hourglass-empty", spin: false, label: t("deploy.status.line"), detail: lineWaits(t, line) };
  }

  if (run !== null && run.endedAt !== null && now - run.endedAt < ENDING_SHOWN_MS && view.detailed) {
    return endedMark(t, run);
  }

  if (view.release !== pageRelease) {
    return { kind: "newer", tone: "primary", icon: DEPLOY_ICON, spin: false, label: t("deploy.status.newer"), detail: t("deploy.action.reload") };
  }

  return null;
}

/** What a TODO row says beside its state of where the item's work stands on its way live. */
export type ItemDeployPhase = "waiting-live" | "in-line" | "deploying" | "deploy-failed";

export const ITEM_DEPLOY_LABELS: Record<ItemDeployPhase, string> = {
  "waiting-live": "todo.label.deploy_waiting_live",
  "in-line": "todo.label.deploy_in_line",
  deploying: "todo.label.deploy_deploying",
  "deploy-failed": "todo.label.deploy_failed",
};

/** Where one commit an item waits on stands on its way live, or a deployment that carries the item by none of them:
 * the unit whose deployment it stands in, where one does, and the repository and the commit it is of, where it is
 * of one. */
export interface ItemWayLive {
  phase: ItemDeployPhase;
  unitName: string | null;
  repository: string | null;
  commit: string | null;
  /** The place its deployment stands at in the line, the first to go being 1; none for a way not waiting its turn. */
  place: number | null;
}

/** What of an item its way live is read from. */
export type ItemOnItsWayLive = Pick<TodoItem, "id" | "done" | "liveState" | "closing">;

const ITEM_MENTION = /#(\d+)/g;

// The fewest letters of a commit two names of it are compared by.
const COMMIT_LETTERS = 7;

// The letters of a commit a chip shows, as the deployment's popover names one.
const COMMIT_SHOWN = 12;

// Whether two names of a commit, either of them shortened, name the same one.
function sameCommit(one: string, other: string): boolean {
  if (one.length < COMMIT_LETTERS || other.length < COMMIT_LETTERS) return false;

  return one.startsWith(other) || other.startsWith(one);
}

// Whether a commit a deployment brings names the item: the item its record names, or a `#NNNN` in its subject.
function namesItem(commit: DeployCommit, item: ItemOnItsWayLive): boolean {
  return commit.todoId === item.id || [...commit.subject.matchAll(ITEM_MENTION)].some((match) => Number(match[1]) === item.id);
}

// Whether a deployment's commits carry one commit the item waits on: that commit, named whole or shortened, and for
// the one commit of an item that names no repository, any commit naming the item as well.
function carries(commits: readonly DeployCommit[], item: ItemOnItsWayLive, waiting: WaitingCommit): boolean {
  return commits.some((one) => (waiting.commit !== null && sameCommit(one.commit, waiting.commit)) || (waiting.repository === null && namesItem(one, item)));
}

// No way live, one list for every item that has none, so a row handed it again is handed nothing new.
const NO_WAYS: readonly ItemWayLive[] = Object.freeze([]);

/**
 * Where an item's work stands on its way live (docs/web.md, the TODO panel's section): one way for each commit its
 * close left waiting, in name order of the repository, its work live only once each of them is. A commit a run under
 * way brings is being put live through every stage of that run, its check and suite among them; else a deployment
 * waiting in the line that brings it has it waiting its turn. Else, once the close merged, it waits for its
 * repository's batch deployment, whether or not the item's job still runs, and its deployment failed where the run
 * the title bar reads brought it and ended failed or rolled back. A run under way, else a waiting deployment, that
 * carries the item by a commit naming it but none it waits on is a way of its own after them. None for a finished
 * item. The unit is the deploy root the deployment is of, which need not be the repository the item is assigned to.
 * What a deployment brings is what it brings live, not the whole release its popover lists.
 */
export function itemWaysLive(view: DeployView | null | undefined, item: ItemOnItsWayLive): readonly ItemWayLive[] {
  if (item.done) return NO_WAYS;

  const run = view?.run ?? null;
  // Several units deploy at once: any run under way says so, not only the one the bar stands.
  const under = [...(view?.runs ?? []), ...(run !== null ? [run] : [])].filter((one) => one.phase === "running");
  const line = view?.line ?? [];
  const waiting = item.closing?.waiting ?? [];
  // A close checking a change before the merge has no chip of a commit only waiting: the row's testbed line says what
  // it runs.
  const merged = item.closing?.phase === "waiting-batch" || item.closing?.phase === "waiting-live";
  const failed = run !== null && (run.end === "failed" || run.end === "rolled-back") ? run : null;

  const ways = waiting.flatMap((one): ItemWayLive[] => {
    const way = (phase: ItemDeployPhase, unitName: string | null, place: number | null = null): ItemWayLive[] => [
      { phase, unitName, repository: one.repository, commit: one.commit, place }
    ];
    const deploying = under.find((deployment) => carries(deployment.brings, item, one));

    if (deploying !== undefined) return way("deploying", deploying.unitName);

    const inLine = line.findIndex((deployment) => carries(deployment.brings, item, one));

    if (inLine !== -1) return way("in-line", line[inLine]!.unitName, inLine + 1);
    if (!merged) return [];
    if (failed !== null && carries(failed.brings, item, one)) return way("deploy-failed", failed.unitName);

    return way("waiting-live", null);
  });

  const apart = (commits: readonly DeployCommit[]) => commits.some((one) => namesItem(one, item)) && !waiting.some((one) => carries(commits, item, one));
  const deploying = under.find((deployment) => apart(deployment.brings));

  if (deploying !== undefined) return [...ways, { phase: "deploying", unitName: deploying.unitName, repository: null, commit: null, place: null }];

  const inLine = line.findIndex((deployment) => apart(deployment.brings));

  if (inLine !== -1) return [...ways, { phase: "in-line", unitName: line[inLine]!.unitName, repository: null, commit: null, place: inLine + 1 }];

  return ways.length === 0 ? NO_WAYS : ways;
}

// The phases of an item's ways, the furthest on first: what the item as a whole is said to stand in.
const ITEM_DEPLOY_ORDER: readonly ItemDeployPhase[] = ["deploying", "deploy-failed", "in-line", "waiting-live"];

/** Where an item's work as a whole stands on its way live: being put live while any of its commits is, without the
 * unit. */
export function itemDeployPhase(view: DeployView | null | undefined, item: ItemOnItsWayLive): ItemDeployPhase | null {
  const ways = itemWaysLive(view, item);

  return ITEM_DEPLOY_ORDER.find((phase) => ways.some((way) => way.phase === phase)) ?? null;
}

/** The words a way-live chip says: the phase, then the unit whose deployment it stands in, else the repository it
 * waits in, then its commit, each where it has one. */
export function itemWayLiveLabel(t: Translate, way: ItemWayLive): string {
  const place = way.unitName ?? way.repository;
  const commit = way.commit?.slice(0, COMMIT_SHOWN) ?? null;

  const phase = way.place === null ? t(ITEM_DEPLOY_LABELS[way.phase]) : t("todo.label.deploy_in_line_at", { n: way.place });

  return [phase, place, commit].filter((part) => part !== null).join(" · ");
}

/** The colour a row's way-live chip wears: waiting for its deployment or its turn, being put live, or its deployment
 * failed. Both waits wear one colour, told apart by their words. */
export const ITEM_DEPLOY_COLOURS: Record<ItemDeployPhase, "info" | "secondary" | "error"> = {
  "waiting-live": "info",
  "in-line": "info",
  deploying: "secondary",
  "deploy-failed": "error"
};

// Each item marked as being put live, made once for as long as the item stands, so the mark read again against a new
// deploy view or a re-read that kept the item hands its row the same item.
const markedDeploying = new WeakMap<TodoItem, TodoItem>();

function deployingItem(item: TodoItem): TodoItem {
  let marked = markedDeploying.get(item);

  if (marked === undefined) {
    marked = { ...item, deploying: true };
    markedDeploying.set(item, marked);
  }

  return marked;
}

/** The board with each queue row a deployment under way carries marked so, and their count, from the deploy view the
 * board does not carry: what tells the panel's rows being put live from those waiting for a deployment. */
export function withDeploying(board: TodoBoard, view: DeployView | null | undefined): TodoBoard {
  const queue = board.queue.map((item) => (itemDeployPhase(view, item) === "deploying" ? deployingItem(item) : item));
  const deploying = queue.filter((item) => item.deploying === true).length;

  return { ...board, queue, standing: { ...board.standing, deploying } };
}
