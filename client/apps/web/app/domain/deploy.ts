import { countText } from "./numbers";
import { formatClock, spanClock } from "bmo-ui/app/domain/time";

import type { DeployCommit, DeployHold, DeployRunView, DeployView, TodoItem } from "#shared/types";
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

/** Which state the mark stands in: a run under way, the hold, a run just ended, or a page older than the console. */
export type DeployMarkKind = "running" | "hold" | "ended" | "newer";

export type DeployTone = "neutral" | "warning" | "success" | "error" | "primary";

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

function endedMark(t: Translate, run: DeployRunView): DeployMark {
  if (run.phase === "cut") {
    return { kind: "ended", tone: "error", icon: "i-material-symbols-link-off", spin: false, label: t("deploy.status.cut"), detail: runDetail(run, stageLabel(t, currentStage(run))) };
  }

  switch (run.outcome) {
    case "live":
      return { kind: "ended", tone: "success", icon: "i-material-symbols-check-circle-outline", spin: false, label: t("deploy.status.live"), detail: runDetail(run) };
    case "rolled-back":
      return { kind: "ended", tone: "error", icon: "i-material-symbols-undo", spin: false, label: t("deploy.status.rolled_back"), detail: runDetail(run) };
    case "stopped":
      return { kind: "ended", tone: "warning", icon: "i-material-symbols-do-not-disturb-on-outline", spin: false, label: t("deploy.status.stopped"), detail: runDetail(run) };
    default:
      return { kind: "ended", tone: "error", icon: "i-material-symbols-error-outline", spin: false, label: t("deploy.status.failed"), detail: runDetail(run, stageLabel(t, currentStage(run))) };
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

// The hold's limit as the clock time it falls at: what happens then, rather than how long is left.
export function holdLimit(t: Translate, hold: DeployHold): string {
  return t("todo.status.deploy_hold_limit", { time: formatClock(hold.until) });
}

/**
 * The mark the bar stands, or null where it stands none. A run under way comes first, then the hold, then a run
 * that ended within the last two minutes, then a page older than the console it was read from. Times are
 * milliseconds.
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

  if (run !== null && run.endedAt !== null && now - run.endedAt < ENDING_SHOWN_MS && view.detailed) {
    return endedMark(t, run);
  }

  if (view.release !== pageRelease) {
    return { kind: "newer", tone: "primary", icon: DEPLOY_ICON, spin: false, label: t("deploy.status.newer"), detail: t("deploy.action.reload") };
  }

  return null;
}

/** What a TODO row says beside its state of where the item's work stands on its way live. */
export type ItemDeployPhase = "testing" | "waiting-live" | "deploying" | "deploy-failed";

export const ITEM_DEPLOY_LABELS: Record<ItemDeployPhase, string> = {
  testing: "todo.label.deploy_testing",
  "waiting-live": "todo.label.deploy_waiting_live",
  deploying: "todo.label.deploy_deploying",
  "deploy-failed": "todo.label.deploy_failed",
};

/** What of an item its way live is read from. */
export type ItemOnItsWayLive = Pick<TodoItem, "id" | "done" | "liveState" | "closing">;

const ITEM_MENTION = /#(\d+)/g;

// The fewest letters of a commit two names of it are compared by.
const COMMIT_LETTERS = 7;

// Whether two names of a commit, either of them shortened, name the same one.
function sameCommit(one: string, other: string): boolean {
  if (one.length < COMMIT_LETTERS || other.length < COMMIT_LETTERS) return false;

  return one.startsWith(other) || other.startsWith(one);
}

// Whether a carried commit names the item: the item its record names, a `#NNNN` in its subject, or the commit
// the item's close handed over.
function commitNames(commit: DeployCommit, item: ItemOnItsWayLive): boolean {
  if (commit.todoId === item.id || [...commit.subject.matchAll(ITEM_MENTION)].some((match) => Number(match[1]) === item.id)) return true;

  return item.closing?.commit != null && sameCommit(commit.commit, item.closing.commit);
}

/**
 * Where one item's work stands on its way live (docs/web.md, the TODO panel's section). A deployment under way one
 * of whose carried commits names the item is testing while its check stage is under way — or before its first
 * stage, where the plan opens with the check — and deploying through every later stage. Else the item's own close
 * says it: testing while a job of the item runs its close, waiting to go live once the close handed its commit
 * over and no job of the item runs, and failed where the run the title bar reads carried that commit and ended
 * failed or rolled back. None for a finished item, or one that says neither.
 */
export function itemDeployPhase(view: DeployView | null | undefined, item: ItemOnItsWayLive): ItemDeployPhase | null {
  if (item.done) return null;

  const run = view?.run ?? null;
  const carried = run !== null && run.carried.some((commit) => commitNames(commit, item));

  if (run !== null && carried && run.phase === "running") {
    const stage = currentStage(run);

    if (stage === null) return run.plan[0] === "check" ? "testing" : "deploying";

    return stage === "check" ? "testing" : "deploying";
  }

  const running = item.liveState != null;

  if (item.closing?.phase === "testing") return running ? "testing" : null;
  if (item.closing?.phase !== "waiting-live" || running) return null;

  return carried && (run?.outcome === "failed" || run?.outcome === "rolled-back") ? "deploy-failed" : "waiting-live";
}
