import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { readWaitingBrings } from "./deploy";

import type { DeployReading } from "./deploy";
import type { DeployCommit, DeployWaiting } from "#shared/types";

// The deployments waiting their turn in the testbed's deployment line (docs/web.md, 「Deployment in the title bar」).
// The testbed serves no reading of its line, and a deployment waiting there has written nothing into its progress
// record yet, so the line is read from the deploy units standing in the user manager (docs/boundary.md, 「Gaps the
// console meets」): each unit's progress record, which its environment names, says which deploy root it deploys, and
// its command line names the commit it was asked for.

// The testbed's name for every deployment's unit, and the variable naming the progress record a run writes.
const UNIT_PATTERN = "bmo-deploy-*";
const PROGRESS_VARIABLE = "BMO_DEPLOY_PROGRESS";
// The suffix the user manager names a service unit with, which the progress record leaves off.
const SERVICE_SUFFIX = ".service";

/** Runs a command and hands back what it printed, or none where it failed. */
export type CommandRunner = (command: readonly string[]) => Promise<string | null>;

export const printedBy: CommandRunner = async (command) => {
  const child = Bun.spawn([...command], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  const [printed, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

  return code === 0 ? printed : null;
};

/** A process's own words as the kernel keeps them: its environment and its arguments, none where it cannot be read. */
export interface ProcessWords {
  environment(pid: number): string[] | null;
  argv(pid: number): string[] | null;
}

// The kernel's own list of a process's words, each ended by a NUL.
function procList(pid: number, part: "environ" | "cmdline"): string[] | null {
  try {
    return readFileSync(`/proc/${pid}/${part}`, "utf8").split("\0").filter((word) => word !== "");
  } catch {
    return null;
  }
}

export const kernelProcessWords: ProcessWords = {
  environment: (pid) => procList(pid, "environ"),
  argv: (pid) => procList(pid, "cmdline")
};

/** The deploy units standing, by their names. */
export async function deployUnitsStanding(run: CommandRunner = printedBy): Promise<string[]> {
  const printed = await run(["systemctl", "--user", "list-units", "--type=service", "--state=active", "-o", "json", "--no-pager", UNIT_PATTERN]);

  if (printed === null) return [];

  try {
    const rows: unknown = JSON.parse(printed);

    return Array.isArray(rows) ? rows.flatMap((row: { unit?: unknown }) => (typeof row?.unit === "string" ? [row.unit] : [])) : [];
  } catch {
    return [];
  }
}

/** One deploy unit as the line is read from it. */
export interface DeployUnitReading {
  unit: string;
  /** When it began, in milliseconds. */
  since: number;
  /** The progress record its environment names; none where it names none. */
  progressFile: string | null;
  /** The commit its command names; none where it names none. */
  commit: string | null;
}

async function unitProperty(run: CommandRunner, unit: string, name: string): Promise<string> {
  return (await run(["systemctl", "--user", "show", "-p", name, "--value", "--timestamp=unix", unit]))?.trim() ?? "";
}

// The commit a deploy command names, read by the runtime's own reader of a command's options.
function commitOf(argv: readonly string[]): string | null {
  const { values } = parseArgs({ args: argv.slice(1), options: { commit: { type: "string" } }, strict: false, allowPositionals: true });

  return typeof values.commit === "string" && values.commit !== "" ? values.commit : null;
}

/** A deploy unit read: its main process's environment and command, and when it began; none where it has no process. */
export async function readDeployUnit(unit: string, run: CommandRunner = printedBy, words: ProcessWords = kernelProcessWords): Promise<DeployUnitReading | null> {
  const pid = Number(await unitProperty(run, unit, "MainPID"));

  if (!Number.isInteger(pid) || pid <= 0) return null;

  // The user manager says a moment as `@` and the seconds since the epoch.
  const began = Number((await unitProperty(run, unit, "ActiveEnterTimestamp")).replace(/^@/, ""));
  const prefix = `${PROGRESS_VARIABLE}=`;
  const progress = words.environment(pid)?.find((word) => word.startsWith(prefix))?.slice(prefix.length) ?? "";

  return {
    unit,
    since: Number.isFinite(began) ? began * 1000 : 0,
    progressFile: progress === "" ? null : progress,
    commit: commitOf(words.argv(pid) ?? [])
  };
}

/**
 * The line out of the units standing: each whose progress record stands under a listed deploy root and does not name
 * it as its run, named by that root's folder name, the one begun first first, as the line takes them in the order
 * they asked. A unit whose record names it has had its turn, and one deploying no listed root is none of the
 * console's.
 */
export function deployLineOf(units: readonly DeployUnitReading[], readings: readonly DeployReading[], brings: (root: string, commit: string) => DeployCommit[] = readWaitingBrings): DeployWaiting[] {
  return units
    .flatMap((one) => {
      if (one.progressFile === null) return [];

      const root = resolve(dirname(one.progressFile));
      const reading = readings.find((each) => each.root != null && resolve(each.root) === root);

      if (reading === undefined || reading.unitName === null) return [];

      const ran = reading.record?.unit ?? null;

      if (ran !== null && (ran === one.unit || `${ran}${SERVICE_SUFFIX}` === one.unit)) return [];

      return [{ unitName: reading.unitName, unit: one.unit, commit: one.commit, since: one.since, brings: one.commit === null ? [] : brings(root, one.commit) }];
    })
    .sort((one, other) => one.since - other.since);
}

/** The deployments waiting in the line, against the listed roots' readings. */
export async function readDeployLine(readings: readonly DeployReading[], run: CommandRunner = printedBy, words: ProcessWords = kernelProcessWords): Promise<DeployWaiting[]> {
  const units = await Promise.all((await deployUnitsStanding(run)).map((unit) => readDeployUnit(unit, run, words)));

  return deployLineOf(units.filter((one): one is DeployUnitReading => one !== null), readings);
}
