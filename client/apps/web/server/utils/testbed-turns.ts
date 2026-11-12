import { homedir } from "node:os";
import { join } from "node:path";

import { agency, agencyCall } from "./agency";
import { liveStates } from "./todos";

import type { ItemTestbedTurn } from "#shared/types";

// The testbed line on a running TODO row (docs/web.md, the TODO panel's section): the testbed's queue as its status
// verb prints it (the testbed's docs/boundary.md, 「`status`」), each holder and waiter tied to a row through the
// checkout it runs in, which the agency names with the job holding it. A command no running job's checkout holds
// stands on no row.

/** One holder or waiter of a lane, as much of it as the row reads. */
export interface TestbedLaneEntry {
  checkout: string;
  command: string;
  pid: number;
}

/** One lane of the testbed's queue: the commands holding its seats, and those waiting in its line, in order. */
export interface TestbedLane {
  name: string;
  holders: TestbedLaneEntry[];
  waiting: TestbedLaneEntry[];
}

/** A checkout the agency names: its path, the node it stands on, and the job holding it. */
export interface HeldCheckout {
  path: string;
  nodeName: string | null;
  job: { jobId: number | null; itemId: number | null } | null;
}

/** The testbed's program, as `TESTBED_BIN` names it, else where bmo installs its commands. */
export function testbedProgram(environment: Record<string, string | undefined> = process.env): string {
  const named = (environment.TESTBED_BIN ?? "").trim();

  return named === "" ? join(homedir(), ".local", "bin", "bmo-testbed") : named;
}

function entryOf(value: unknown): TestbedLaneEntry | null {
  if (typeof value !== "object" || value === null) return null;

  const { checkout, command, pid } = value as Record<string, unknown>;

  return typeof checkout === "string" && typeof command === "string" && typeof pid === "number" ? { checkout, command, pid } : null;
}

function entriesOf(value: unknown): TestbedLaneEntry[] {
  return Array.isArray(value) ? value.map(entryOf).filter((entry): entry is TestbedLaneEntry => entry !== null) : [];
}

/** The lanes out of what `status --json` printed, already read as JSON; none where it holds no queue page. */
export function lanesOf(status: unknown): TestbedLane[] {
  const items = (status as { queues?: { items?: unknown } } | null)?.queues?.items;

  if (!Array.isArray(items)) return [];

  return items.flatMap((lane: unknown) => {
    if (typeof lane !== "object" || lane === null) return [];

    const { name, holders, waiting } = lane as Record<string, unknown>;

    return typeof name === "string" ? [{ name, holders: entriesOf(holders), waiting: entriesOf(waiting) }] : [];
  });
}

/** The testbed's lanes as its status verb prints them now; none where the program does not run or answers nothing readable. */
export async function readTestbedLanes(program: string = testbedProgram()): Promise<TestbedLane[]> {
  try {
    // Run outside any repository, so the status names no close line.
    const child = Bun.spawn([program, "status", "--json"], { cwd: "/", stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const [printed, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

    return code === 0 ? lanesOf(JSON.parse(printed)) : [];
  } catch {
    return [];
  }
}

// The checkout of this machine a command's folder lies in: the same folder or one under it, the deepest where one
// checkout stands inside another. A checkout on a work node is never one, since its commands queue on that node.
function checkoutOf(folder: string, checkouts: readonly HeldCheckout[]): HeldCheckout | null {
  const inside = checkouts.filter((one) => one.nodeName === null && (folder === one.path || folder.startsWith(`${one.path.replace(/\/+$/, "")}/`)));

  return inside.sort((one, other) => other.path.length - one.path.length)[0] ?? null;
}

// Whether one turn says more than another: a held seat before a wait, and a wait nearer the front before one further back.
function nearer(one: ItemTestbedTurn, other: ItemTestbedTurn): boolean {
  if (one.place === null) return other.place !== null;

  return other.place !== null && one.place < other.place;
}

/**
 * Each running item's turn in the testbed's queue: a command belongs to an item where the checkout it runs in is held
 * by the job the item runs now. One turn an item, the nearest; a command holding several seats is one command.
 */
export function itemTestbedTurns(lanes: readonly TestbedLane[], checkouts: readonly HeldCheckout[], running: ReadonlyMap<number, number>): ItemTestbedTurn[] {
  const turns = new Map<number, ItemTestbedTurn>();

  const take = (entry: TestbedLaneEntry, place: number | null): void => {
    const job = checkoutOf(entry.checkout, checkouts)?.job ?? null;

    if (job === null || job.itemId === null || job.jobId === null || running.get(job.itemId) !== job.jobId) return;

    const turn: ItemTestbedTurn = { itemId: job.itemId, command: entry.command, place };
    const held = turns.get(job.itemId);

    if (held === undefined || nearer(turn, held)) turns.set(job.itemId, turn);
  };

  for (const lane of lanes) {
    for (const entry of lane.holders) take(entry, null);
    lane.waiting.forEach((entry, at) => take(entry, at + 1));
  }

  return [...turns.values()].sort((one, other) => one.itemId - other.itemId);
}

/** Every running item's turn in the testbed's queue now. */
export async function readItemTestbedTurns(): Promise<ItemTestbedTurn[]> {
  const lanes = await readTestbedLanes();

  if (lanes.every((lane) => lane.holders.length === 0 && lane.waiting.length === 0)) return [];

  const [repositories, live] = await Promise.all([agencyCall(agency().GET("/repositories")).catch(() => ({ items: [] })), liveStates()]);
  const checkouts = repositories.items.flatMap((repository) => repository.checkouts);
  const running = new Map([...live].map(([itemId, job]) => [itemId, job.job]));

  return itemTestbedTurns(lanes, checkouts, running);
}
