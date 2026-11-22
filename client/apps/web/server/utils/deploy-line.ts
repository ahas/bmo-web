import { resolve } from "node:path";

import { readWaitingBrings } from "./deploy";
import { testbedProgram } from "./testbed-turns";

import type { DeployReading } from "./deploy";
import type { DeployCommit, DeployWaiting } from "#shared/types";

// The deployments waiting their turn in the testbed's deployment line (docs/web.md, 「Deployment in the title bar」), as
// the testbed's status verb lists them in the order its line will serve them, those waiting for their deploy root's
// turn included (the testbed's docs/deploy.md, 「The deployment line」), each ticket naming the deploy root it deploys,
// its unit, the whole commit it asks for and when it asked.

// The testbed's name for every deployment's unit.
const UNIT_PATTERN = "bmo-deploy-*";

/** Runs a command and hands back what it printed, or none where it failed. */
export type CommandRunner = (command: readonly string[]) => Promise<string | null>;

export const printedBy: CommandRunner = async (command) => {
  try {
    const child = Bun.spawn([...command], { cwd: "/", stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const [printed, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

    return code === 0 ? printed : null;
  } catch {
    return null;
  }
};

/** The deploy units standing, by their names: their coming and going is the line moving. */
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

/** One waiting deployment as the testbed's status names it. */
interface WaitingTicket {
  unit: string;
  root: string;
  commit: string | null;
  askedAt: number;
}

// The waiting tickets out of what `status --json` printed, already read as JSON, in the order it lists them. A ticket
// that names no unit or no deploy root, as one a testbed of an earlier revision stood, is read past.
function ticketsOf(status: unknown): WaitingTicket[] {
  const waiting = (status as { deployLine?: { waiting?: unknown } } | null)?.deployLine?.waiting;

  if (!Array.isArray(waiting)) return [];

  return waiting.flatMap((ticket: unknown) => {
    if (typeof ticket !== "object" || ticket === null) return [];

    const { unit, root, commit, askedAt } = ticket as Record<string, unknown>;

    if (typeof unit !== "string" || typeof root !== "string") return [];

    return [{ unit, root, commit: typeof commit === "string" && commit !== "" ? commit : null, askedAt: typeof askedAt === "number" ? askedAt : 0 }];
  });
}

/**
 * The line out of the testbed's status: each waiting deployment whose deploy root is a listed root, named by that
 * root's folder name, in the order the testbed lists them, which is the order its line will serve them. One deploying
 * no listed root is none of the console's.
 */
export function deployLineOf(status: unknown, readings: readonly DeployReading[], brings: (root: string, commit: string) => DeployCommit[] = readWaitingBrings): DeployWaiting[] {
  return ticketsOf(status).flatMap((ticket) => {
    const root = resolve(ticket.root);
    const reading = readings.find((each) => each.root != null && resolve(each.root) === root);

    if (reading === undefined || reading.unitName === null) return [];

    return [{ unitName: reading.unitName, unit: ticket.unit, commit: ticket.commit, since: ticket.askedAt, brings: ticket.commit === null ? [] : brings(root, ticket.commit) }];
  });
}

/** The deployments waiting in the line, against the listed roots' readings; none where the status cannot be read. */
export async function readDeployLine(readings: readonly DeployReading[], run: CommandRunner = printedBy, program: string = testbedProgram()): Promise<DeployWaiting[]> {
  const printed = await run([program, "status", "--json"]);

  if (printed === null) return [];

  try {
    return deployLineOf(JSON.parse(printed), readings);
  } catch {
    return [];
  }
}
