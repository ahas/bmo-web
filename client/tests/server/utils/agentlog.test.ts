import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import { toolOf } from "../../../apps/web/server/utils/agentlog";

import type { AgentLogPage } from "../../../apps/web/shared/types";

// An agent's log as the agency's fixed API holds it (the agency's `docs/api.md`, 「log-lines」): one page of every line
// the agent left across its runs — its newest, the page before or after an id, the page a moment stands in — and one
// run's lines narrowed from the same log. A link naming a run the agency holds none of answers as unavailable.

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

// One agent's page, read as the agency's document describes it: that agent's lines alone, oldest first, and whether a
// page waits on the side the read was made towards.
function agentPage(url: URL): Record<string, unknown> {
  const limit = Number(url.searchParams.get("limit") ?? "500");
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const at = url.searchParams.get("at");
  const mine = LINES.filter((one) => one.agentName === "agent-a").map((one) => one.id as number);

  if (at !== null) {
    // The page a moment opens: the run standing at that moment, with lines on either side of it.
    return { items: LINES.filter((one) => one.agentName === "agent-a" && (one.id as number) >= 3 && (one.id as number) <= 4), hasMore: true, hasOlder: true };
  }

  if (before !== null) {
    const older = mine.filter((id) => id < Number(before));

    return { items: LINES.filter((one) => older.slice(-limit).includes(one.id as number)), hasMore: older.length > limit, hasOlder: false };
  }

  if (after !== null) {
    const newer = mine.filter((id) => id > Number(after));

    return { items: LINES.filter((one) => newer.slice(0, limit).includes(one.id as number)), hasMore: newer.length > limit, hasOlder: false };
  }

  const newest = mine.slice(-limit);

  return { items: LINES.filter((one) => newest.includes(one.id as number)), hasMore: mine.length > limit, hasOlder: false };
}

const RUNS = [
  { id: 7, name: "run-a", agentName: "agent-a", unitName: "unit", workerName: null, jobId: null, state: "ended", startedAt: 1_000, endedAt: null, outcome: null, capEndsAt: null, keptUntil: null },
  { id: 8, name: "run-b", agentName: "agent-a", unitName: "unit", workerName: null, jobId: null, state: "ended", startedAt: 2_000, endedAt: null, outcome: null, capEndsAt: null, keptUntil: null }
];

const agency = standIn("AGENCY", (call) => {
  const url = new URL(call.path, "http://agency");

  if (url.pathname === "/runs") {
    const named = url.searchParams.get("names");

    return answer({ items: RUNS.filter((one) => one.name === named), more: false });
  }

  if (url.pathname === AGENT_LINES) return answer(agentPage(url));

  const after = Number(url.searchParams.get("after") ?? "0");
  const agent = url.searchParams.get("agentName");
  const runId = Number(url.searchParams.get("runId") ?? "0");

  return answer({ items: LINES.filter((one) => one.runId === runId && (one.id as number) > after && (agent === null || one.agentName === agent)), more: false });
});
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

describe("an agent's log read by its run", () => {
  test("is the agent's own lines of that run, a prompt standing whole, and the log above it said to stand", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-a" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3, 4]);
    expect(page.lines[0]).toMatchObject({ kind: "prompt", text: "the whole prompt", patches: [], patchesMore: 0 });
    expect(page.hasMore).toBe(false);
    // Nothing of the agent's stands before the log's own first line.
    expect(page.hasOlder).toBe(false);
    expect(agency.asked.map((one) => one.path)).toEqual([
      "/runs?names=run-a&limit=1",
      "/log-lines?runId=7&agentName=agent-a&after=0&limit=500",
      `${AGENT_LINES}?before=1&limit=1`
    ]);
  });

  test("is followed from the last line a reader has", async () => {
    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-a", after: "3" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([4]);
  });

  test("says another page waits where it read more than one page asks for", async () => {
    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-a", limit: "2" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([1, 3]);
    expect(page.hasMore).toBe(true);
  });

  test("says whether the agent's log stands above a run that is not the log's first, so the screen is read upward from it", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-b" } })).answer!;

    expect(page.lines.map((one) => one.id)).toEqual([5]);
    expect(page.hasOlder).toBe(true);
    expect(agency.asked.at(-1)?.path).toBe(`${AGENT_LINES}?before=5&limit=1`);
  });

  test("answers as unavailable for a run the agency holds none of, asking nothing more", async () => {
    agency.asked.length = 0;

    const page = (await asked(handler, { params: { name: "agent-a" }, query: { run: "run-gone" } })).answer!;

    expect(page).toEqual({ lines: [], hasMore: false, unavailable: true });
    expect(agency.asked.map((one) => one.path)).toEqual(["/runs?names=run-gone&limit=1"]);
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
