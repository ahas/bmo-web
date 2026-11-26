import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { AgentLogPage } from "../../../apps/web/shared/types";

// A job's own log, read by the job (docs/web.md, 「Where the log comes from」). What is pinned here is the shape the
// agency answers a live job in: its lines carry their job and no run (`runId` 0), they stand under the role agent
// that did the work rather than the checkout whose name the run ledger puts on the run, and the job may hold no run
// name at all. Every page is asked for the job alone, so none of that reaches a screen.

const at = 1_790_000_000_000;
const FIRST = 2_001;
const COUNT = 60;

function lineOf(index: number, id = FIRST + index): Record<string, unknown> {
  return {
    id,
    runId: 0,
    jobId: 77,
    agentName: "coder-07",
    kind: index % 4 === 3 ? "tool-result" : "text",
    text: `line ${index + 1}`,
    at: at + index * 1_000,
    fields: { run: "job-77" },
    metadata: null
  };
}

const LINES: Record<string, unknown>[] = Array.from({ length: COUNT }, (_, index) => lineOf(index));

// The job as the agency holds it: no run name and no ledger row, which is how a job whose turn has published none
// stands, and an agent no screen was opened under.
const JOB = {
  id: 77,
  itemId: 3_989,
  leaseId: 3,
  holderName: "owner",
  assignmentId: 9,
  workerName: "bmo-web-w2",
  repositoryName: "bmo-web",
  roleName: "coder",
  agentName: "coder-07",
  sessionId: "bmo-web-w2@run:4975",
  runId: null,
  runName: null,
  roomId: null,
  state: "running",
  outcome: null,
  report: null,
  tokenCount: 0,
  startedAt: at,
  endedAt: null
};

const agency = standIn("AGENCY", (one) => {
  const url = new URL(one.path, "http://agency");

  if (url.pathname === "/jobs/77") return answer(JOB);

  if (url.pathname === "/log-lines") {
    if (url.searchParams.get("jobId") !== "77") return answer({ items: [], more: false });

    const limit = Number(url.searchParams.get("limit") ?? "500");
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");

    if (after !== null) {
      const newer = LINES.filter((line) => (line.id as number) > Number(after));

      return answer({ items: newer.slice(0, limit), more: newer.length > limit });
    }

    // The agency reads the page just before a line id: the last lines under it, oldest first.
    const older = before === null ? LINES : LINES.filter((line) => (line.id as number) < Number(before));

    return answer({ items: older.slice(-limit), more: older.length > limit });
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});

const log = await routeOf<AgentLogPage>("../../apps/web/server/api/jobs/[id]/log.get");

describe("a job's own log", () => {
  test("opens on its newest lines, asked for the job alone", async () => {
    agency.asked.length = 0;

    const read = await asked(log, { params: { id: "77" }, query: { limit: 20 } });

    expect(agency.asked.map((one) => one.path)).toEqual(["/jobs/77", `/log-lines?jobId=77&limit=20&before=${Number.MAX_SAFE_INTEGER}`]);
    expect(read.answer?.lines.map((line) => line.id)).toEqual(ids(40, 20));
    expect(read.answer?.hasMore).toBe(true);
    expect(read.answer?.unavailable).toBeUndefined();
    // Each line names itself by the run its job's lines carry, under the agent that wrote it.
    expect(read.answer?.lines[0]).toMatchObject({ agent: "coder-07", run: "job-77", kind: "text" });
  });

  test("reads the job's older lines before the oldest line held", async () => {
    const oldest = (await asked(log, { params: { id: "77" }, query: { limit: 5 } })).answer?.lines[0]!;

    agency.asked.length = 0;

    const back = await asked(log, { params: { id: "77" }, query: { limit: 5, before: oldest.id } });

    expect(agency.asked.map((one) => one.path)).toEqual(["/jobs/77", `/log-lines?jobId=77&limit=5&before=${oldest.id}`]);
    expect(back.answer?.lines.map((line) => line.id)).toEqual([0, 1, 2, 3, 4].map((step) => oldest.id - 5 + step));
  });

  test("reads from the job's first line where a screen opens at its place", async () => {
    agency.asked.length = 0;

    const read = await asked(log, { params: { id: "77" }, query: { limit: 5, after: 0 } });

    // An id of nought names no line: this is the read from the start, not the newest page asked another way.
    expect(agency.asked.map((one) => one.path)).toEqual(["/jobs/77", "/log-lines?jobId=77&limit=5&after=0"]);
    expect(read.answer?.lines.map((line) => line.id)).toEqual([2_001, 2_002, 2_003, 2_004, 2_005]);
  });

  test("follows the lines that land after the newest one held", async () => {
    const newest = FIRST + COUNT - 1;

    LINES.push(lineOf(COUNT, 2_100));

    try {
      agency.asked.length = 0;

      const read = await asked(log, { params: { id: "77" }, query: { limit: 50, after: newest } });

      expect(agency.asked.map((one) => one.path)).toEqual(["/jobs/77", `/log-lines?jobId=77&limit=50&after=${newest}`]);
      expect(read.answer?.lines.map((line) => line.id)).toEqual([2_100]);
    } finally {
      LINES.pop();
    }
  });

  test("answers as no job for a number the agency holds none of, and refuses a number that is none", async () => {
    expect((await asked(log, { params: { id: "91" } })).status).toBe(404);
    expect((await asked(log, { params: { id: "not-a-job" } })).status).toBe(400);
  });
});

// The ids of `count` lines counting from the line `from` steps past the job's first.
function ids(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => FIRST + from + index);
}
