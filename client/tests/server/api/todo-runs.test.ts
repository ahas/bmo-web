import { expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ItemRuns } from "../../../apps/web/shared/types";

// What the jobs that carried an item say of it (docs/web.md, the TODO modal's state tab): how many ran it and for how
// long, the road its latest answered on and the newest plan it laid out of its own, read from the lines that stand
// under the worker's name.

const job = (id: number, itemId: number, startedAt: number, runId: number | null) => ({
  id, itemId, leaseId: 1, holderName: "h", assignmentId: 1, workerName: "worker-a", sessionId: null, runId, runName: `run-${id}`,
  state: "ended", outcome: null, report: null, tokenCount: 0, startedAt, endedAt: startedAt + 10
});
const plan = (steps: { content: string; status: string }[]) => JSON.stringify({ todos: steps });

const agency = standIn("AGENCY", (call) => {
  if (call.path.startsWith("/jobs")) return answer({ items: [job(1, 7, 100, 11), job(2, 7, 200, 22), job(3, 8, 300, 33)], more: false });
  if (call.path.startsWith("/log-lines")) {
    return answer({
      items: [
        { id: 1, kind: "tool", text: plan([{ content: "read", status: "completed" }]) },
        { id: 2, kind: "tool", text: '{"command":"ls"}' },
        { id: 3, kind: "tool", text: plan([{ content: "read", status: "completed" }, { content: "build", status: "in_progress" }]) },
        { id: 4, kind: "answer", text: JSON.stringify({ kind: "answer", model: JSON.stringify(["deepseek", "deepseek-flash"]) }) }
      ],
      more: false
    });
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});
const handler = await routeOf<ItemRuns>("../../apps/web/server/api/todos/[id]/runs.get");

test("counts the item's jobs and their time, and reads the road and the newest plan of its latest", async () => {
  agency.asked.length = 0;

  const read = await asked(handler, { params: { id: "7" }, query: { worker: "worker-a" } });

  expect(read.answer).toEqual({
    attempts: 2,
    seconds: 0.02,
    ranOn: { provider: "deepseek", model: "deepseek-flash", changed: false },
    plan: [{ title: "read", state: "done" }, { title: "build", state: "running" }],
    latest: { agent: "worker-a", run: "run-2" }
  });
  expect(agency.asked.map((one) => one.path)).toContain("/log-lines?runId=22&agentName=worker-a&after=0&limit=500");
});

test("is nothing where no job of the item ran", async () => {
  expect((await asked(handler, { params: { id: "9" }, query: {} })).answer).toEqual({ attempts: 0, seconds: null, ranOn: null, plan: [], latest: null });
});
