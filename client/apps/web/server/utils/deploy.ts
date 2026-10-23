import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { deployPhase, readDeployProgress } from "#shared/deploy-progress";

import { holdOf, readQueues } from "./todos";

import type { DeployLogLine, DeployRunView, DeployView } from "#shared/types";
import type { DeployProgress } from "#shared/deploy-progress";

// The deployment as the title bar reads it (docs/web.md, 「Deployment in the title bar」): the testbed's progress
// record (the testbed's `docs/deploy.md`, 「What a deployment says of itself as it runs」) of every unit whose deploy
// root the `DEPLOY_ROOTS` setting lists, whether the run behind each still runs, and the deployment's hold, which
// bmo-job keeps. None of the records asks a unit, so the reading stands while the units restart under a
// deployment; a console that lists no root has no deployment to show.

// The record's file under a deploy root.
const RECORD_FILE = "deploy-progress.json";

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
 * deploy root's own folder name. */
export interface DeployReading {
  unitName: string | null;
  record: DeployProgress | null;
  writtenAt: number | null;
}

/** Every listed root's record, in the order the roots stand. */
export function readDeployReadings(roots: readonly string[] = deployRoots()): DeployReading[] {
  return roots.map((root) => ({ ...readDeployReading(join(root, RECORD_FILE)), unitName: basename(root) }));
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

  return latest(running, (reading) => reading.record!.startedAt) ?? latest(held, endOf) ?? { unitName: null, record: null, writtenAt: null };
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

/** The run as a tab reads it. A run cut off ends at the record's last write, the latest moment known of it. */
export function deployRunView(record: DeployProgress, writtenAt: number | null, unitName: string | null, alive: (pid: number) => boolean = processAlive): DeployRunView {
  const phase = deployPhase(record, alive);

  return {
    unitName,
    phase,
    startedAt: record.startedAt,
    endedAt: record.ending?.at ?? (phase === "cut" ? (writtenAt ?? record.startedAt) : null),
    outcome: record.ending?.outcome ?? null,
    commit: record.commit,
    plan: record.plan,
    stages: record.stages,
    steps: record.steps,
    ahead: record.ahead,
    running: record.running
  };
}

/**
 * What a tab is handed. A member hears only that a run is under way and when it began: not what goes live, how
 * far it is, how it ended, nor the hold (docs/web.md, 「Access」).
 */
export function deployViewFor(reading: DeployReading, hold: DeployView["hold"], release: string, detailed: boolean, alive: (pid: number) => boolean = processAlive): DeployView {
  const run = reading.record === null ? null : deployRunView(reading.record, reading.writtenAt, reading.unitName, alive);

  if (detailed) return { release, detailed, run, hold };

  return {
    release,
    detailed,
    run: run === null || run.phase !== "running" ? null : { ...run, unitName: null, commit: null, plan: [], stages: [], steps: [], ahead: [], running: null },
    hold: null
  };
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
