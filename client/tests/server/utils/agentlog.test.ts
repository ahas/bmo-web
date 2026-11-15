import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { clockOf, toolOf } from "../../../apps/web/server/utils/agentlog";
import { AGENT_LOG_RUN_SCAN } from "../../../apps/web/shared/config";

import type { AgentLogPage } from "../../../apps/web/shared/types";

// An agent's log as the agency's fixed API holds it (the agency's `docs/api.md`, 「log-lines」): one page of every line
// the agent left across its runs — its newest, the page before or after an id, the page a moment stands in — and one
// run's lines: from its start or a line of it narrowed from the same log, and its newest lines or the lines before one
// of it read back out of the agent's log. A link naming a run the agency holds none of answers as unavailable.

function line(id: number, agentName: string, kind: string, fields: Record<string, unknown> = {}, text = `line ${id}`): Record<string, unknown> {
  return { id, runId: 7, jobId: null, agentName, kind, text, at: 1_000 + id, fields };
}

// The agent's lines across two runs, with a co-worker's branch written under the first: a prompt standing whole, a
// call and its result, and the line a later run left.
const LINES = [
  line(1, "agent-a", "prompt", {}, "the whole prompt"),
  line(2, "agent-b", "text"),
  line(3, "agent-a", "tool", { name: "mcp__toolbook__call" }),
  line(4, "agent-a", "tool-result", { name: "Read" }),
  { ...line(5, "agent-a", "text", {}, "from the next run"), runId: 8 }
];

const AGENT_LINES = "/log/agents/agent-a/lines";

// A coder's log over three runs: an old run of a hundred lines that later runs buried, then a long job with a sparse
// run's lines among its own, one in every hundred.
const CODER = "agent-c";
const CODER_LINES_PATH = `/log/agents/${CODER}/lines`;
const OLD = { id: 11, name: "run-old" };
const LONG = { id: 9, name: "run-long" };
const SPARSE = { id: 10, name: "run-sparse" };

function coderLine(id: number): Record<string, unknown> {
  const run = id <= 1_100 ? OLD : id % 100 === 0 ? SPARSE : LONG;

  return { ...line(id, CODER, "text", { run: run.name }), runId: run.id };
}

const CODER_LINES = Array.from({ length: 3_100 }, (_, index) => coderLine(1_001 + index));

// A job's run whose lines stand under the very agent the ledger names it for: under the agent they carry their job and
// no run, and a read of the run's own lines answers them with the ledger's run.
const LEDGER_AGENT = "agent-v";
const JOB_HERE = { id: 14, name: "job-77", job: 77 };
const JOB_HERE_LINES: Record<string, unknown>[] = Array.from({ length: 80 }, (_, index) => ({
  ...line(7_001 + index, LEDGER_AGENT, "text"),
  runId: 0,
  jobId: JOB_HERE.job,
  ledgerRunId: JOB_HERE.id
}));

// A seat that ran two jobs one after the other, the second still going. A job's lines stand under the seat, carrying
// the job's run by name and a run id of nought, while the ledger names the job's run for the worker it was ordered
// for, a name no line stands under.
const SEAT = "agent-s";
const SEAT_LINES_PATH = `/log/agents/${SEAT}/lines`;
const WORKER = "agent-w";
const EARLIER_JOB = { id: 41, run: "job-41", ledger: 13 };
const JOB = { id: 42, run: "job-42", ledger: 12 };

function seatLine(id: number): Record<string, unknown> {
  const job = id <= 5_400 ? EARLIER_JOB : JOB;

  return { ...line(id, SEAT, "text", { run: job.run }), runId: 0, jobId: job.id };
}

const SEAT_LINES = Array.from({ length: 1_000 }, (_, index) => seatLine(5_001 + index));
const ALL = [...LINES, ...CODER_LINES, ...JOB_HERE_LINES, ...SEAT_LINES];

// The ids of one run's lines in the coder's log, oldest first.
function idsOf(run: { id: number }): number[] {
  return CODER_LINES.filter((one) => one.runId === run.id).map((one) => one.id as number);
}

// One agent's page, read as the agency's document describes it: that agent's lines alone, oldest first, and whether a
// page waits on the side the read was made towards.
function agentPage(url: URL, agentName: string): Record<string, unknown> {
  const limit = Number(url.searchParams.get("limit") ?? "500");
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const at = url.searchParams.get("at");
  const mine = ALL.filter((one) => one.agentName === agentName);

  if (at !== null) {
    // The page a moment opens: the run standing at that moment, with lines on either side of it.
    return { items: mine.filter((one) => (one.id as number) >= 3 && (one.id as number) <= 4), hasMore: true, hasOlder: true };
  }

  if (before !== null) {
    const older = mine.filter((one) => (one.id as number) < Number(before));

    return { items: older.slice(-limit), hasMore: older.length > limit, hasOlder: false };
  }

  if (after !== null) {
    const newer = mine.filter((one) => (one.id as number) > Number(after));

    return { items: newer.slice(0, limit), hasMore: newer.length > limit, hasOlder: false };
  }

  return { items: mine.slice(-limit), hasMore: mine.length > limit, hasOlder: false };
}

function ledgerRun(id: number, name: string, agentName: string): Record<string, unknown> {
  return { id, name, agentName, unitName: "unit", workerName: null, jobId: null, state: "ended", startedAt: 1_000 * id, endedAt: null, outcome: null, capEndsAt: null, keptUntil: null };
}

const RUNS = [
  ledgerRun(7, "run-a", "agent-a"),
  ledgerRun(8, "run-b", "agent-a"),
  ledgerRun(OLD.id, OLD.name, CODER),
  ledgerRun(LONG.id, LONG.name, CODER),
  ledgerRun(SPARSE.id, SPARSE.name, CODER),
  ledgerRun(JOB_HERE.id, JOB_HERE.name, LEDGER_AGENT),
  ledgerRun(JOB.ledger, JOB.run, WORKER),
  ledgerRun(EARLIER_JOB.ledger, EARLIER_JOB.run, WORKER)
];

// The job a ledger run of a job stands for: the agency reads such a run's own lines as the job's.
const JOB_OF_RUN = new Map([JOB, EARLIER_JOB].map((job) => [job.ledger, job.id]));

const agency = standIn("AGENCY", (call) => {
  const url = new URL(call.path, "http://agency");

  if (url.pathname === "/runs") {
    const named = url.searchParams.get("names");

    return answer({ items: RUNS.filter((one) => one.name === named), more: false });
  }

  const agentPath = /^\/log\/agents\/([^/]+)\/lines$/.exec(url.pathname);

  if (agentPath !== null) return answer(agentPage(url, decodeURIComponent(agentPath[1]!)));

  // One run's own lines, as the agency answers them: forward from its start or from a line, and nothing else, every
  // filter it is given holding, the agent's among them.
  const after = Number(url.searchParams.get("after") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "500");
  const agent = url.searchParams.get("agentName");
  const runId = Number(url.searchParams.get("runId") ?? "0");
  const job = JOB_OF_RUN.get(runId);
  const found = ALL.filter((one) =>
    (one.id as number) > after &&
    (agent === null || one.agentName === agent) &&
    (job === undefined ? (one.ledgerRunId ?? one.runId) === runId : one.jobId === job)
  );

  return answer({ items: found.slice(0, limit).map((one) => ({ ...one, runId })), more: found.length > limit });
});

// The paths the agency was asked, the run's own one-line reads apart from every other read.
function readsOf(): { probes: string[]; others: string[] } {
  const paths = agency.asked.map((one) => one.path);
  const probe = (path: string): boolean => path.startsWith("/log-lines?") && path.endsWith("&limit=1");

  return { probes: paths.filter(probe), others: paths.filter((path) => !probe(path)) };
}
const handler = await routeOf<AgentLogPage>("../../apps/web/server/api/agents/[name]/log.get");

describe("an agent's log across its runs", () => {
  test("opens on the newest page, the line before it said to be waiting", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { limit: "2" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([4, 5]);
    expect(page.hasMore).toBe(true);
    expect(page.hasOlder).toBeUndefined();
    expect(agency.asked.map((one) => one.path)).toEqual([`${AGENT_LINES}?limit=2`]);
  });

  test("goes back by the id of the oldest line the reader holds", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { before: "4", limit: "10" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3]);
    expect(page.hasMore).toBe(false);
    expect(agency.asked.map((one) => one.path)).toEqual([`${AGENT_LINES}?limit=10&before=4`]);
  });

  test("follows the id of the newest line the reader holds, across runs", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { after: "3", limit: "10" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([4, 5]);
    expect(page.hasMore).toBe(false);
    expect(agency.asked.map((one) => one.path)).toEqual([`${AGENT_LINES}?limit=10&after=3`]);
  });

  test("opens at a moment, in the seconds the console keeps, narrowed to the room the link names", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { at: "1790000000", chat: "90000001", limit: "10" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([3, 4]);
    expect(page.hasOlder).toBe(true);
    expect(page.hasMore).toBe(true);
    expect(agency.asked.map((one) => one.path)).toEqual([`${AGENT_LINES}?limit=10&at=1790000000000&chat=90000001`]);
  });

  test("a moment that is no moment opens the newest page rather than failing it", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { at: "soon" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3, 4, 5]);
    expect(agency.asked.map((one) => one.path)).toEqual([`${AGENT_LINES}?limit=30`]);
  });

  test("a reader holding no line yet is handed the newest page", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { after: "0" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3, 4, 5]);
    expect(agency.asked.map((one) => one.path)).toEqual([`${AGENT_LINES}?limit=30`]);
  });
});

describe("an agent's log read by its run from its start", () => {
  test("is the agent's own lines of that run, a prompt standing whole, and the log above it said to stand", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-a", after: "0" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3, 4]);
    expect(page.lines[0]).toMatchObject({ kind: "prompt", text: "the whole prompt", patches: [], patchesMore: 0 });
    expect(page.hasMore).toBe(false);
    // Nothing of the agent's stands before the log's own first line.
    expect(page.hasOlder).toBe(false);
    expect(agency.asked.map((one) => one.path)).toEqual([
      "/runs?names=run-a&limit=1",
      "/log-lines?runId=7&after=0&limit=1",
      "/log-lines?runId=7&agentName=agent-a&after=0&limit=500",
      `${AGENT_LINES}?before=1&limit=1`
    ]);
  });

  test("is followed from the last line a reader has", async () => {
    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-a", after: "3" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([4]);
  });

  test("says another page waits where it read more than one page asks for", async () => {
    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-a", after: "0", limit: "2" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3]);
    expect(page.hasMore).toBe(true);
  });

  test("says whether the agent's log stands above a run that is not the log's first, so the screen is read upward from it", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-b", after: "0" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([5]);
    expect(page.hasOlder).toBe(true);
    expect(agency.asked.at(-1)?.path).toBe(`${AGENT_LINES}?before=5&limit=1`);
  });

  test("answers as unavailable for a run the agency holds none of, asking nothing more", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-gone", after: "0" } })).answer!;

    expect(page).toEqual({ lines: [], hasMore: false, unavailable: true });
    expect(agency.asked.map((one) => one.path)).toEqual(["/runs?names=run-gone&limit=1"]);
  });
});

// A screen standing at one run opens on its newest lines, however long it has gone: the agency reads a run's own lines
// forward from its start alone, so they are read back out of the agent's log with the run's lines kept.
describe("an agent's log read by its run from its newest line", () => {
  test("finds a job's run by its job, whose lines the agent's log names by their job and no run", async () => {
    const page = (await asked(handler, { params: { name: LEDGER_AGENT }, query: { run: JOB_HERE.name, limit: "50" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual(JOB_HERE_LINES.slice(-50).map((one) => one.id as number));
    expect(page.hasMore).toBe(true);
  });

  test("opens on the run's newest lines alone out of the agent's newest page, never reading the run from its start", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: CODER }, query: { run: LONG.name, limit: "50" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual(idsOf(LONG).slice(-50));
    expect(page.lines.every((one) => one.run === LONG.name)).toBe(true);
    expect(page.hasMore).toBe(true);
    expect(agency.asked.map((one) => one.path)).toEqual([
      `/runs?names=${LONG.name}&limit=1`,
      `/log-lines?runId=${LONG.id}&after=0&limit=1`,
      `${CODER_LINES_PATH}?limit=500`
    ]);
  });

  test("goes back through the run by the oldest line the reader holds, until its first line", async () => {
    agency.asked.length = 0;

    const opening = idsOf(LONG).slice(-50);
    const page = (await asked(handler, { params: { name: CODER }, query: { run: LONG.name, before: String(opening[0]), limit: "200" } })).answer!;
    const older = idsOf(LONG).filter((id) => id < opening[0]!);

    expect(page.lines.map((one) => one.id)).toEqual(older.slice(-200));
    expect(page.hasMore).toBe(true);
    expect(readsOf().others.at(-1)).toBe(`${CODER_LINES_PATH}?limit=500&before=${opening[0]}`);

    const head = (await asked(handler, { params: { name: CODER }, query: { run: LONG.name, before: "1150", limit: "200" } })).answer!;

    expect(head.lines.map((one) => one.id)).toEqual(idsOf(LONG).filter((id) => id < 1_150));
    expect(head.hasMore).toBe(false);
  });

  test("a run whose lines are sparse among the agent's looks through no more than its bound, and says the rest waits above", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: CODER }, query: { run: SPARSE.name, limit: "50" } })).answer!;
    const seen = CODER_LINES.length - AGENT_LOG_RUN_SCAN;

    expect(page.lines.map((one) => one.id)).toEqual(idsOf(SPARSE).filter((id) => id > 1_000 + seen));
    expect(page.lines.every((one) => one.run === SPARSE.name)).toBe(true);
    expect(page.hasMore).toBe(true);
    expect(readsOf().others.filter((path) => path.startsWith(CODER_LINES_PATH))).toHaveLength(AGENT_LOG_RUN_SCAN / 500);

    const rest = (await asked(handler, { params: { name: CODER }, query: { run: SPARSE.name, before: String(page.lines[0]!.id), limit: "50" } })).answer!;

    expect([...rest.lines, ...page.lines].map((one) => one.id)).toEqual(idsOf(SPARSE));
    expect(rest.hasMore).toBe(false);
  });

  test("a run that ended under later runs is found by its newest line and read back from there", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: CODER }, query: { run: OLD.name, limit: "50" } })).answer!;
    const reads = readsOf();

    expect(page.lines.map((one) => one.id)).toEqual(idsOf(OLD).slice(-50));
    expect(page.lines.every((one) => one.run === OLD.name)).toBe(true);
    expect(page.hasMore).toBe(true);
    // A few one-line reads find the run's newest line; the run is never read a page at a time from its start.
    expect(reads.probes.length).toBeLessThan(16);
    expect(reads.others.some((path) => path.startsWith("/log-lines"))).toBe(false);
    expect(reads.others.at(-1)).toBe(`${CODER_LINES_PATH}?limit=500&before=1101`);
  });

  test("a run with no line before the one the reader holds answers none, and nothing above", async () => {
    const page = (await asked(handler, { params: { name: CODER }, query: { run: OLD.name, before: "1001" } })).answer!;

    expect(page).toEqual({ lines: [], hasMore: false });
  });

  test("answers as unavailable for a run the agency holds none of", async () => {
    const page = (await asked(handler, { params: { name: CODER }, query: { run: "run-gone" } })).answer!;

    expect(page).toEqual({ lines: [], hasMore: false, unavailable: true });
  });
});

// A job's log opened from the TODO panel stands at the job's run on the seat that ran it.
describe("a job's log read by its run", () => {
  test("opens on the job's newest lines out of the seat's own log, never asking the worker the ledger names", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: SEAT }, query: { run: JOB.run, limit: "50" } })).answer!;
    const job = SEAT_LINES.filter((one) => one.jobId === JOB.id).map((one) => one.id as number);

    expect(page.lines.map((one) => one.id)).toEqual(job.slice(-50));
    expect(page.lines.every((one) => one.run === JOB.run && one.agent === SEAT)).toBe(true);
    expect(page.hasMore).toBe(true);
    expect(agency.asked.map((one) => one.path)).toEqual([
      `/runs?names=${JOB.run}&limit=1`,
      `/log-lines?runId=${JOB.ledger}&after=0&limit=1`,
      `${SEAT_LINES_PATH}?limit=500`
    ]);
  });

  test("keeps another job's lines of the same seat out, reading back to the job's first line", async () => {
    const page = (await asked(handler, { params: { name: SEAT }, query: { run: EARLIER_JOB.run, limit: "500" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual(SEAT_LINES.filter((one) => one.jobId === EARLIER_JOB.id).map((one) => one.id as number));
    expect(page.hasMore).toBe(false);
  });

  test("read from its start, asks the seat's log whether lines stand above it", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: SEAT }, query: { run: JOB.run, after: "0", limit: "10" } })).answer!;

    expect(page.lines[0]?.id).toBe(5_401);
    expect(page.hasOlder).toBe(true);
    expect(agency.asked.at(-1)?.path).toBe(`${SEAT_LINES_PATH}?before=5401&limit=1`);
  });
});

describe("how a call shows its tool", () => {
  test("an MCP tool by its own name without its server, and every tool with the one generic icon", () => {
    expect(toolOf({ kind: "tool", name: "mcp__toolbook__call" })).toEqual({ name: "call", icon: null });
    expect(toolOf({ kind: "tool-result", name: "toolbook/call" })).toEqual({ name: "call", icon: null });
    expect(toolOf({ kind: "tool", name: "Read" })).toEqual({ name: "Read", icon: null });
  });

  test("a line about no tool shows none", () => {
    expect(toolOf({ kind: "text", name: "Read" })).toBeNull();
    expect(toolOf({ kind: "tool", name: null })).toBeNull();
  });
});

import { patchesOf } from "../../../apps/web/server/utils/agentlog";

// The files a shell command changed, as the structured result its program recorded beside the line says: each file
// with its hunks stands as a command's change, the files past the record's cap and the changed paths it did not lay
// out are counted, and a change longer than the screen is sent stands as the ordinary result (docs/web.md, 「Agent
// log」, the file change block).
describe("the changes a shell command made", () => {
  const hunk = { oldStart: 3, oldLines: 2, newStart: 3, newLines: 3, lines: [" kept", "-old", "+new", "+more"] };

  test("stand as command patches read off the recorded result", () => {
    const read = patchesOf({
      fields: {},
      metadata: { toolUseResult: { bashEditDiff: { files: [{ filePath: "/repo/a.ts", hunks: [hunk] }], moreFiles: 0, changedFiles: ["/repo/a.ts", "/repo/b.ts"] } } }
    });

    expect(read.patches).toEqual([{ filePath: "/repo/a.ts", type: null, by: "command", hunks: [hunk], content: null, tooLarge: false }]);
    expect(read.patchesMore).toBe(1);
  });

  test("are none on a line whose result recorded no change", () => {
    expect(patchesOf({ fields: {}, metadata: { toolUseResult: { stdout: "ok" } } })).toEqual({ patches: [], patchesMore: 0 });
    expect(patchesOf({ fields: {} })).toEqual({ patches: [], patchesMore: 0 });
  });

  test("stand as the ordinary result past the size the screen is sent", () => {
    const long = { ...hunk, lines: Array.from({ length: 4_001 }, (_, at) => `+${at}`) };
    const read = patchesOf({ fields: {}, metadata: { toolUseResult: { bashEditDiff: { files: [{ filePath: "/repo/a.ts", hunks: [long] }], moreFiles: 0, changedFiles: ["/repo/a.ts"] } } } });

    expect(read.patches[0]).toMatchObject({ filePath: "/repo/a.ts", tooLarge: true, hunks: [] });
  });
});

describe("a call clock's note", () => {
  test("is read off the fields the agency keeps on it, never off its words", () => {
    const clock = clockOf({
      fields: {},
      metadata: { toolClock: { event: "kept", call: null, tool: "Bash", command: "sleep 600", pid: null, elapsedMs: null, keptMs: 3_592_000, extra: 1 } }
    });

    expect(clock).toEqual({
      event: "kept",
      call: null,
      tool: "Bash",
      command: "sleep 600",
      pid: null,
      elapsedMs: null,
      silentMs: null,
      keptMs: 3_592_000,
      why: null,
      cut: null,
      outcome: null
    });
  });

  test("a note with no clock fields, or an event the console does not know, has no clock", () => {
    expect(clockOf({ fields: {}, metadata: null })).toBeNull();
    expect(clockOf({ fields: {}, metadata: { toolClock: { event: "paused", tool: "Bash" } } })).toBeNull();
  });
});
