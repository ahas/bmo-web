import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { JobLine, JobPrompt, StatusView } from "../../../apps/web/shared/types";

// A worker's job line with its prompt, and the jobs that have just run on the live board, read from a stand-in
// agency. What is pinned here is that each is asked on the route the agency states, for the run the screen was
// opened at, and read into the screens' shapes: seconds where the agency answers milliseconds.

const at = 1_790_000_000_000;

function jobOf(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 8,
    itemId: 41,
    leaseId: 1,
    holderName: "owner",
    assignmentId: 1,
    workerName: "worker-b",
    repositoryName: "repo-b",
    sessionId: null,
    runId: 8,
    runName: "job-unit-8",
    roomId: 90000001,
    state: "ended",
    outcome: "ok",
    report: null,
    tokenCount: 0,
    startedAt: at,
    endedAt: at + 60_000,
    ...over
  };
}

const SPENT = { inputTokens: 5, outputTokens: 1_200, cacheReadTokens: 80_000, cacheWriteTokens: 900 };

// A line of a running job's run, carrying the request it came from as the writer files it, in the model API's names.
function requestLine(id: number, request: string, output: number, runId = 12): Record<string, unknown> {
  return {
    id,
    runId,
    agentName: "worker-d",
    kind: "tool",
    text: `line ${id}`,
    at: at + id,
    fields: {},
    metadata: { request: { id: request, usage: { input_tokens: 2, output_tokens: output, cache_read_input_tokens: 1_000, cache_creation_input_tokens: 10 } } }
  };
}

function resultLine(id: number, runId = 12): Record<string, unknown> {
  return { id, runId, agentName: "worker-d", kind: "tool-result", text: "out", at, fields: {}, metadata: null };
}

// The running job's run as it has grown so far: two lines of one request, a result no request stands on, and another
// request's line; a test adds lines as the run goes on. The ended job's run reported less than its own figure says.
const RUN_LINES: Record<string, unknown>[] = [
  requestLine(1, "msg-a", 300),
  requestLine(2, "msg-a", 300),
  resultLine(3),
  requestLine(4, "msg-b", 50),
  requestLine(101, "msg-z", 10, 8),
  resultLine(102, 8),
  resultLine(103, 8)
];

const agency = standIn("AGENCY", (one) => {
  const url = new URL(one.path, "http://agency");

  if (url.pathname === "/log-lines") {
    const after = Number(url.searchParams.get("after") ?? "0");

    return answer({ items: RUN_LINES.filter((line) => String(line.runId) === url.searchParams.get("runId") && (line.id as number) > after), more: false });
  }

  if (url.pathname === "/jobs") {
    if (url.searchParams.get("repositoryName") === "worker-b") {
      return answer({ items: [jobOf({ id: 8, runName: "job-unit-1", usage: SPENT })], more: false });
    }

    if (url.searchParams.get("repositoryName") === "worker-d") {
      return answer({ items: [jobOf({ id: 12, runId: 12, runName: "job-unit-12", workerName: "worker-d", state: "running", endedAt: null, outcome: null })], more: false });
    }

    if (url.searchParams.get("repositoryName") === "worker-c") return answer({ items: [], more: false });

    if (url.searchParams.get("state") === "starting") {
      return answer({
        items: [jobOf({ id: 10, runId: 10, runName: "job-unit-10", state: "starting", endedAt: null, outcome: null })],
        more: false
      });
    }

    if (url.searchParams.get("state") === "running") {
      return answer({
        items: [jobOf({ id: 9, runId: 9, runName: "job-unit-9", state: "running", roomId: null, endedAt: null, outcome: null })],
        more: false
      });
    }

    if (url.searchParams.get("state") === "ended") {
      return answer({
        items: [
          jobOf({ id: 8, runName: "job-unit-8" }),
          jobOf({ id: 7, workerName: "worker-b", state: "ended", outcome: "failed", report: "a look around", endedAt: at + 5_000 }),
          jobOf({ id: 6, itemId: 40, state: "ended", outcome: "ok", endedAt: at + 1_000 })
        ],
        more: false
      });
    }

    if (url.searchParams.get("state") === "stopped") return answer({ items: [], more: false });

    return answer({
      items: [
        jobOf({ id: 9, runId: 9, runName: "job-unit-9", state: "running", endedAt: null, outcome: null }),
        jobOf({ id: 8, runName: "job-unit-8" }),
        jobOf({ id: 7, workerName: "worker-b", state: "ended", outcome: "failed", report: "a look around", endedAt: at + 5_000 }),
        jobOf({ id: 6, itemId: 40, state: "ended", outcome: "ok", endedAt: at + 1_000 })
      ],
      more: false
    });
  }

  if (url.pathname === "/jobs/8/prompt") return answer({ jobId: 8, text: "the prompt as read", english: "the prompt as handed" });

  return answer({ code: "not-found", error: "no route" }, 404);
});

standIn("RECEIVER", (one) => (one.path === "/live" ? answer({ at, turns: [], compacting: [], queued: [] }) : answer({ code: "not-found", error: "no route" }, 404)));

const jobs = standIn("JOB", (one) => (
  one.path === "/items/41"
    ? answer({ id: 41, title: "a row", brief: "", queueName: "todo", state: "leased", scope: "90000001", approvals: [], labels: {}, cowork: false })
    : answer({ code: "not-found", error: "no route" }, 404)
));

const line = await routeOf<{ job: JobLine | null }>("../../apps/web/server/api/agents/[name]/job.get");
const prompt = await routeOf<{ prompt: JobPrompt | null }>("../../apps/web/server/api/agents/[name]/job-prompt.get");
const status = await routeOf<StatusView>("../../apps/web/server/api/status.get");

describe("a worker's job line", () => {
  test("is the job the agency names for the run the screen was opened at, in seconds", async () => {
    agency.asked.length = 0;

    const read = await asked(line, { params: { name: "worker-b" }, query: { run: "job-unit-1" } });

    expect(agency.asked.map((one) => one.path)).toEqual(["/jobs?repositoryName=worker-b&limit=50", "/log-lines?runId=8&after=0&limit=500"]);
    expect(read.answer).toEqual({
      job: {
        run: "job-unit-1",
        agent: "worker-b",
        todoId: 41,
        title: null,
        purpose: null,
        startedAt: 1_790_000_000,
        finishedAt: 1_790_000_060,
        tools: 2,
        models: [],
        spent: SPENT
      }
    });
  });

  test("a running job's calls and spend are what its run reported, each request once, read on from the last line read", async () => {
    agency.asked.length = 0;

    const first = (await asked(line, { params: { name: "worker-d" } })).answer?.job;

    expect(first?.tools).toBe(1);
    expect(first?.spent).toEqual({ inputTokens: 4, outputTokens: 350, cacheReadTokens: 2_000, cacheWriteTokens: 20 });

    RUN_LINES.push(requestLine(5, "msg-b", 50), requestLine(6, "msg-c", 25), resultLine(7));

    const second = (await asked(line, { params: { name: "worker-d" } })).answer?.job;

    expect(second?.tools).toBe(2);
    expect(second?.spent).toEqual({ inputTokens: 6, outputTokens: 375, cacheReadTokens: 3_000, cacheWriteTokens: 30 });
    expect(agency.asked.map((one) => one.path).filter((path) => path.startsWith("/log-lines"))).toEqual([
      "/log-lines?runId=12&after=0&limit=500",
      "/log-lines?runId=12&after=4&limit=500"
    ]);
  });

  test("asks for no run where the screen was opened at none, and is nothing for a worker with no job", async () => {
    agency.asked.length = 0;

    expect((await asked(line, { params: { name: "worker-c" } })).answer).toEqual({ job: null });
    expect(agency.asked.map((one) => one.path)).toEqual(["/jobs?repositoryName=worker-c&limit=50", "/jobs?roleName=worker-c&limit=50"]);
  });

  test("refuses a name no agent can have, without asking the agency", async () => {
    agency.asked.length = 0;

    expect(await asked(line, { params: { name: "../workers" } })).toMatchObject({ status: 400 });
    expect(agency.asked).toEqual([]);
  });
});

describe("the prompt of that job", () => {
  test("is its reading and the English its worker was handed, for the same run", async () => {
    agency.asked.length = 0;

    expect((await asked(prompt, { params: { name: "worker-b" }, query: { run: "job-unit-1" } })).answer).toEqual({
      prompt: { text: "the prompt as read", english: "the prompt as handed" }
    });
    expect(agency.asked.map((one) => one.path)).toEqual(["/jobs?repositoryName=worker-b&limit=50", "/jobs/8/prompt"]);
    expect((await asked(prompt, { params: { name: "worker-c" } })).answer).toEqual({ prompt: null });
  });
});

describe("the jobs running and the jobs that have just run on the live board", () => {
  test("are the ones the agency lists, with their item and worker", async () => {
    agency.asked.length = 0;
    jobs.asked.length = 0;

    const board = (await asked(status, {})).answer;

    expect(agency.asked.map((one) => one.path).sort()).toEqual([
      "/jobs?state=ended&limit=10",
      "/jobs?state=running&limit=500",
      "/jobs?state=starting&limit=500",
      "/jobs?state=stopped&limit=10"
    ]);
    // A job whose launch named no room is placed by its item's scope.
    expect(jobs.asked.map((one) => one.path)).toEqual(["/items/41"]);
    expect(board?.reachable).toBe(true);
    expect(board?.live).toEqual([
      {
        id: 10,
        kind: "worker",
        agent: "worker-b",
        chatId: 90000001,
        messageId: null,
        startedAt: 1_790_000_000,
        unit: "job-unit-10",
        capSeconds: null,
        depth: null,
        model: null,
        startedBy: null,
        todoId: 41,
        repository: "repo-b",
        checkout: "worker-b",
        purpose: null,
        progress: null,
        waiting: null,
        stop: { kind: "item", id: "41" }
      },
      {
        id: 9,
        kind: "worker",
        agent: "worker-b",
        chatId: 90000001,
        messageId: null,
        startedAt: 1_790_000_000,
        unit: "job-unit-9",
        capSeconds: null,
        depth: null,
        model: null,
        startedBy: null,
        todoId: 41,
        repository: "repo-b",
        checkout: "worker-b",
        purpose: null,
        progress: null,
        waiting: null,
        stop: { kind: "item", id: "41" }
      }
    ]);
    expect(board?.jobs).toEqual([
      { id: 8, unit: "", chatId: 0, model: null, launchedAt: 1_790_000_000, finishedAt: 1_790_000_060, outcome: "ok", ok: true, todoId: 41, attempt: 1, purpose: null, worker: "worker-b", repository: "repo-b", checkout: "worker-b" },
      { id: 7, unit: "", chatId: 0, model: null, launchedAt: 1_790_000_000, finishedAt: 1_790_000_005, outcome: "failed", ok: false, todoId: 41, attempt: 1, purpose: "a look around", worker: "worker-b", repository: "repo-b", checkout: "worker-b" },
      { id: 6, unit: "", chatId: 0, model: null, launchedAt: 1_790_000_000, finishedAt: 1_790_000_001, outcome: "ok", ok: true, todoId: 40, attempt: 1, purpose: null, worker: "worker-b", repository: "repo-b", checkout: "worker-b" }
    ]);
  });
});
