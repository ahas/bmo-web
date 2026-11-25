import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { deployPhase, readDeployProgress } from "#shared/deploy-progress";

import { holdOf, readQueues } from "./todos";

import type { DeployCommit, DeployEnd, DeployLogLine, DeployRunView, DeployView, DeployWaiting } from "#shared/types";
import type { DeployProgress } from "#shared/deploy-progress";

// The deployment as the title bar reads it (docs/web.md, 「Deployment in the title bar」): the testbed's progress
// record (the testbed's `docs/deploy.md`, 「What a deployment says of itself as it runs」) of every unit whose deploy
// root the `DEPLOY_ROOTS` setting lists, whether the run behind each still runs, the commits the deploy carries,
// and the deployment's hold, which bmo-job keeps. None of the records asks a unit, so the reading stands while the
// units restart under a deployment; a console that lists no root has no deployment to show.

// The record's file under a deploy root, the record a finished deployment leaves, and its one line a deploy.
const RECORD_FILE = "deploy-progress.json";
const DEPLOYED_FILE = "deployed.json";
const DEPLOY_LOG_FILE = "deployed.log";
// The build tree the testbed keeps the repository in under a deploy root, whose own log carries the commits between
// two deploys.
const EXPAND_DIR = "deploy-expand";

/** The deploy roots, as the setting lists them, separated by `:`. */
export function deployRoots(environment: Record<string, string | undefined> = process.env): string[] {
  return (environment.DEPLOY_ROOTS ?? "").split(":").map((root) => root.trim()).filter((root) => root !== "");
}

/** Whether a process still runs, by asking the kernel whether it could be signalled. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    // Refused means it is there and is someone else's.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The record and when it was last written, or nothing where there is none, with the unit whose run it is: its
 * deploy root's own folder name, and the root the record, its deploy log and its build tree stand under. */
export interface DeployReading {
  unitName: string | null;
  record: DeployProgress | null;
  writtenAt: number | null;
  root?: string | null;
}

/** Every listed root's record, in the order the roots stand. */
export function readDeployReadings(roots: readonly string[] = deployRoots()): DeployReading[] {
  return roots.map((root) => ({ ...readDeployReading(join(root, RECORD_FILE)), unitName: basename(root), root }));
}

/**
 * The run the mark stands: a run under way before any that ended, the one begun last where several run at once;
 * with none under way, the one that ended last, a run cut off counting as ended at its record's last write.
 */
export function shownReading(readings: readonly DeployReading[], alive: (pid: number) => boolean = processAlive): DeployReading {
  const held = readings.filter((reading) => reading.record !== null);
  const running = held.filter((reading) => deployPhase(reading.record!, alive) === "running");
  const endOf = (reading: DeployReading): number => reading.record!.ending?.at ?? reading.writtenAt ?? reading.record!.startedAt;
  const latest = (pool: DeployReading[], when: (reading: DeployReading) => number): DeployReading | undefined =>
    pool.reduce<DeployReading | undefined>((best, one) => (best === undefined || when(one) > when(best) ? one : best), undefined);

  return latest(running, (reading) => reading.record!.startedAt) ?? latest(held, endOf) ?? { unitName: null, record: null, writtenAt: null, root: null };
}

/** Every run under way, each read with the commits it brings live: several units deploy at once. */
export function runningDeployRuns(readings: readonly DeployReading[], alive: (pid: number) => boolean = processAlive): DeployRunView[] {
  return readings
    .filter((reading) => reading.record !== null && deployPhase(reading.record, alive) === "running")
    .map((reading) => deployRunView(reading.record!, reading.writtenAt, reading.unitName, alive, readDeployCommits(reading)));
}

export function readDeployReading(path: string | null): Omit<DeployReading, "unitName"> {
  if (path === null) return { record: null, writtenAt: null };

  let text: string | null;

  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = null;
  }

  const record = readDeployProgress(text);

  if (record === null) return { record: null, writtenAt: null };

  try {
    return { record, writtenAt: statSync(path).mtimeMs };
  } catch {
    return { record, writtenAt: null };
  }
}

// A deployment's own record of what it put live, and one line of its log of every deploy before it.
interface DeployedRecord {
  commit: string;
  subject: string;
  version: string | null;
  todoId: number | null;
}

interface DeployLogEntry {
  at: string;
  commit: string;
  subject: string;
}

function numberIn(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);

  return null;
}

// The item a deployed record names, where it names one: the field a record of this console's carries, or the first
// item of a list, which a record of another unit may write.
function itemInRecord(record: Record<string, unknown>): number | null {
  const direct = numberIn(record.todoId) ?? numberIn(record.item);

  if (direct !== null) return direct;

  const items = Array.isArray(record.items) ? record.items : [];

  for (const item of items) {
    const found = numberIn(item) ?? (typeof item === "object" && item !== null ? numberIn((item as Record<string, unknown>).id) ?? numberIn((item as Record<string, unknown>).todoId) : null);

    if (found !== null) return found;
  }

  return null;
}

function readDeployedRecord(root: string): DeployedRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, DEPLOYED_FILE), "utf8"));
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const commit = typeof record?.commit === "string" ? record.commit : null;

    if (record === null || commit === null) return null;

    return {
      commit,
      subject: typeof record.subject === "string" ? record.subject : "",
      version: typeof record.version === "string" ? record.version : null,
      todoId: itemInRecord(record)
    };
  } catch {
    return null;
  }
}

function readDeployLog(root: string): DeployLogEntry[] {
  let text: string;

  try {
    text = readFileSync(join(root, DEPLOY_LOG_FILE), "utf8");
  } catch {
    return [];
  }

  return text.split("\n").flatMap((line) => {
    const match = /^(\S+)\s+([0-9a-f]{7,40})\s+(.*)$/.exec(line.trim());

    return match === null ? [] : [{ at: match[1]!, commit: match[2]!, subject: match[3]! }];
  });
}

// The repository's own log, read in the build tree the deploy root keeps, which is a checkout of the repository at
// the commit it last expanded.
function gitIn(root: string, args: readonly string[]): string | null {
  const tree = join(root, EXPAND_DIR);

  if (!existsSync(tree)) return null;

  const done = Bun.spawnSync(["git", "-C", tree, ...args], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });

  return done.exitCode === 0 ? done.stdout.toString() : null;
}

// The commits between two deploys, oldest first, each with its subject.
function carriedBetween(root: string, from: string | null, to: string): { commit: string; subject: string }[] {
  const out = gitIn(root, from === null
    ? ["log", "--reverse", "-1", "--format=%H%x00%s", to]
    : ["log", "--reverse", "--format=%H%x00%s", `${from}..${to}`]);

  if (out === null) return [];

  return out.split("\n").flatMap((line) => {
    const [commit, subject] = line.split("\u0000");

    return commit === undefined || commit === "" || subject === undefined ? [] : [{ commit, subject }];
  });
}

function itemInSubject(subject: string): number | null {
  const named = /#(\d+)\b/.exec(subject);

  return named === null ? null : Number(named[1]);
}

// The commits from one deploy line to a commit, oldest first, as a tab reads them; where no commit stands between
// them the commit itself stands alone. Each carries the item its subject names, or, for the deployed record's own
// commit, the item that record names.
function commitsUpTo(root: string, from: DeployLogEntry | null, current: string, deployed: DeployedRecord | null, entries: readonly DeployLogEntry[]): DeployCommit[] {
  let commits = carriedBetween(root, from?.commit ?? null, current);

  if (commits.length === 0) {
    const subject = current === deployed?.commit && deployed.subject !== ""
      ? deployed.subject
      : entries.find((entry) => entry.commit === current)?.subject ?? gitIn(root, ["show", "-s", "--format=%s", current])?.trim() ?? "";

    if (subject !== "") commits = [{ commit: current, subject }];
  }

  return commits.map((commit) => ({
    commit: commit.commit,
    subject: commit.subject,
    todoId: itemInSubject(commit.subject) ?? (commit.commit === current && current === deployed?.commit ? deployed.todoId : null)
  }));
}

/**
 * What a deployment brings live, oldest first: the commits since the deploy line before it, which the release live
 * before it did not hold. It is what the popover lists and what a TODO row is carried by. The deployed log names the
 * deploys and their commits; the build tree the root keeps carries the commits in between.
 */
export function readDeployCommits(reading: DeployReading): DeployCommit[] {
  const root = reading.root ?? null;
  const deployed = root === null ? null : readDeployedRecord(root);
  // A run under way has its own commit already in its progress record, while the deployed record still names the
  // release before it.
  const current = reading.record?.commit ?? deployed?.commit ?? null;

  if (root === null || current === null) return [];

  const entries = readDeployLog(root);
  const at = entries.findLastIndex((entry) => entry.commit === current);
  // The deploy before this one: the line before it where the log names it, or the last line where the run has not
  // written its own yet.
  const before = at < 0 ? (entries.at(-1) ?? null) : (at > 0 ? entries[at - 1]! : null);
  // What a run brings is reckoned from the last deploy written before it began, never from an earlier line of its own
  // commit: a run that writes no line of its own, under way, failed or a deploy of the commit already live, would
  // otherwise bring again what that earlier deploy put live. A deploy read from its record alone has no start, and its
  // own line is the one the log names it by.
  const started = reading.record?.startedAt ?? null;
  const since = started === null ? before : (entries.findLast((entry) => Date.parse(entry.at) < started) ?? null);

  if (since !== null && sameCommitName(since.commit, current)) return [];

  return commitsUpTo(root, since, current, deployed, entries);
}

// Whether two names of a commit, either of them shortened, name the same one.
function sameCommitName(one: string, other: string): boolean {
  return one.startsWith(other) || other.startsWith(one);
}

/**
 * What a deployment waiting in the line would bring live: the commits from the release its root has live to the
 * commit it was asked for, none where the build tree does not hold that commit yet.
 */
export function readWaitingBrings(root: string, commit: string): DeployCommit[] {
  if (gitIn(root, ["cat-file", "-e", `${commit}^{commit}`]) === null) return [];

  const deployed = readDeployedRecord(root);

  // A deployment of the commit already live brings nothing.
  if (deployed !== null && sameCommitName(deployed.commit, commit)) return [];

  const live = deployed === null ? null : { at: "", commit: deployed.commit, subject: deployed.subject };

  return commitsUpTo(root, live, commit, deployed, readDeployLog(root));
}

/**
 * Whether the service manager was asked to stop a deployment unit: its journal holds the stop job systemd writes,
 * which a unit whose process ended on its own — a crash, the kernel's kill for memory — never gets.
 */
export function unitStopAsked(unit: string): boolean {
  const done = Bun.spawnSync(["journalctl", "--user", "-u", unit, "-o", "json", "-n", "1", "--no-pager", "JOB_TYPE=stop"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });

  return done.exitCode === 0 && done.stdout.toString().trim() !== "";
}

/**
 * How a run ended, as the console tells it (docs/web.md, 「Deployment in the title bar」). The testbed writes a gate
 * that did not pass and a refusal alike as stopped, and only the refusal is a run that never began; a run whose
 * process went without ending its record was withdrawn where its unit was stopped on request, and failed otherwise.
 */
export function runEnd(record: DeployProgress, phase: DeployRunView["phase"], stopAsked: (unit: string) => boolean = unitStopAsked): DeployEnd | null {
  if (phase === "running") return null;
  if (phase === "cut") return record.unit !== null && stopAsked(record.unit) ? "withdrawn" : "failed";

  switch (record.ending!.outcome) {
    case "live":
      return "live";
    case "rolled-back":
      return "rolled-back";
    case "stopped":
      return record.refused ? "refused" : "failed";
    default:
      return "failed";
  }
}

/** The run as a tab reads it. A run cut off ends at the record's last write, the latest moment known of it. */
export function deployRunView(record: DeployProgress, writtenAt: number | null, unitName: string | null, alive: (pid: number) => boolean = processAlive, brings: DeployCommit[] = [], stopAsked: (unit: string) => boolean = unitStopAsked): DeployRunView {
  const phase = deployPhase(record, alive);

  return {
    unitName,
    phase,
    startedAt: record.startedAt,
    endedAt: record.ending?.at ?? (phase === "cut" ? (writtenAt ?? record.startedAt) : null),
    end: runEnd(record, phase, stopAsked),
    commit: record.commit,
    brings,
    plan: record.plan,
    stages: record.stages,
    steps: record.steps,
    ahead: record.ahead,
    running: record.running
  };
}

/** What the administrator is handed beside the run that stands: the deployment's hold, what that run brings live, every run under way and the deployments waiting in the line. */
export interface DeployDetail {
  hold: DeployView["hold"];
  brings: DeployCommit[];
  runs: DeployRunView[];
  line: DeployWaiting[];
}

/**
 * What a tab is handed: the detail for the administrator, none for a member. A member hears nothing of a run — not
 * that one goes, what goes live, how far it is or how it ended — nor the hold or the line, and reads only the
 * release, for the new-version mark (docs/web.md, 「Access」).
 */
export function deployViewFor(reading: DeployReading, release: string, detail: DeployDetail | null, alive: (pid: number) => boolean = processAlive, stopAsked: (unit: string) => boolean = unitStopAsked): DeployView {
  if (detail === null) return { release, detailed: false, run: null, hold: null };

  const run = reading.record === null ? null : deployRunView(reading.record, reading.writtenAt, reading.unitName, alive, detail.brings, stopAsked);

  return { release, detailed: true, run, runs: detail.runs, line: detail.line, hold: detail.hold };
}

/** The deployment's hold as bmo-job keeps it; none where bmo-job does not answer, since the mark then knows of none. */
export async function readDeployHoldRow(): Promise<DeployView["hold"]> {
  try {
    const holds = (await readQueues()).flatMap((queue) => queue.holds);

    return holds.length === 0 ? null : holdOf(holds[0]);
  } catch {
    return null;
  }
}

/**
 * The last lines of a deployment unit's journal, oldest first. journalctl hands each entry as one JSON object a
 * line; a message that is not text — journald keeps raw bytes as an array — is left out.
 */
export function deployJournal(unit: string, count: number): DeployLogLine[] {
  const done = Bun.spawnSync(["journalctl", "--user", "-u", unit, "-o", "json", "-n", String(count), "--no-pager"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });

  if (done.exitCode !== 0) return [];

  return done.stdout.toString().split("\n").flatMap((line) => {
    if (line.trim() === "") return [];

    try {
      const entry = JSON.parse(line) as { MESSAGE?: unknown; __REALTIME_TIMESTAMP?: unknown };
      const micros = Number(entry.__REALTIME_TIMESTAMP);

      return typeof entry.MESSAGE === "string" && Number.isFinite(micros) ? [{ at: Math.floor(micros / 1000), text: entry.MESSAGE }] : [];
    } catch {
      return [];
    }
  });
}
