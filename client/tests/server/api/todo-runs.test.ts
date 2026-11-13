import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ItemRuns } from "../../../apps/web/shared/types";

// What the jobs that carried an item say of it (docs/web.md, the TODO modal's state tab): how many ran it and for how
// long, its latest job's line with that job's start and end, the road it answered on and the newest plan it laid out
// of its own, read from the lines that stand under the worker's name.

const AT = 1_790_000_000_000;
const SPENT = { inputTokens: 5, outputTokens: 1_200, cacheReadTokens: 80_000, cacheWriteTokens: 900 };

const job = (id: number, itemId: number, startedAt: number, endedAt: number | null, runId: number | null) => ({
  id, itemId, leaseId: 1, holderName: "h", assignmentId: 1, workerName: "worker-a", sessionId: null, runId, runName: `run-${id}`,
  state: endedAt === null ? "running" : "ended", outcome: null, report: null, tokenCount: 0, startedAt, endedAt,
  usage: endedAt === null ? null : SPENT
});
const plan = (steps: { content: string; status: string }[]) => JSON.stringify({ todos: steps });

// Item 7 ran twice and has ended; item 8's job, on the same worker, started after both; item 9's job still runs.
const JOBS = [
  job(1, 7, AT, AT + 10_000, 11),
  job(2, 7, AT + 100_000, AT + 160_000, 22),
  job(3, 8, AT + 300_000, AT + 310_000, 33),
  job(4, 9, AT + 400_000, null, 44)
];

const agency = standIn("AGENCY", (call) => {
  if (call.path.startsWith("/jobs")) return answer({ items: JOBS, more: false });
  if (call.path.startsWith("/log-lines")) {
    return answer({
      items: [
        { id: 1, kind: "tool", text: plan([{ content: "read", status: "completed" }]) },
        { id: 2, kind: "tool", text: '{"command":"ls"}' },
        { id: 3, kind: "tool-result", text: "out" },
        { id: 4, kind: "tool", text: plan([{ content: "read", status: "completed" }, { content: "build", status: "in_progress" }]) },
        { id: 5, kind: "tool-result", text: "out" },
        { id: 6, kind: "answer", text: JSON.stringify({ kind: "answer", model: JSON.stringify(["deepseek", "deepseek-flash"]) }) }
      ],
      more: false
    });
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});
const handler = await routeOf<ItemRuns>("../../apps/web/server/api/todos/[id]/runs.get");

test("an ended item keeps its last job's line: its start and end, its tool calls and the agency's own spend", async () => {
  agency.asked.length = 0;

  const read = await asked(handler, { params: { id: "7" }, query: { worker: "worker-a" } });

  expect(read.answer).toEqual({
    attempts: 2,
    seconds: 70,
    ranOn: { provider: "deepseek", model: "deepseek-flash", changed: false },
    plan: [{ title: "read", state: "done" }, { title: "build", state: "running" }],
    latest: {
      run: "run-2",
      agent: "worker-a",
      todoId: 7,
      title: null,
      purpose: null,
      startedAt: (AT + 100_000) / 1000,
      finishedAt: (AT + 160_000) / 1000,
      tools: 2,
      models: [],
      spent: SPENT
    }
  });
  expect(agency.asked.map((one) => one.path)).toContain("/log-lines?runId=22&agentName=worker-a&after=0&limit=500");
});

test("a running item's last job has no end yet", async () => {
  const latest = (await asked(handler, { params: { id: "9" }, query: { worker: "worker-a" } })).answer?.latest;

  expect(latest).toMatchObject({ run: "run-4", startedAt: (AT + 400_000) / 1000, finishedAt: null, tools: 2 });
});

test("is nothing where no job of the item ran", async () => {
  expect((await asked(handler, { params: { id: "10" }, query: {} })).answer).toEqual({ attempts: 0, seconds: null, ranOn: null, plan: [], latest: null });
});
