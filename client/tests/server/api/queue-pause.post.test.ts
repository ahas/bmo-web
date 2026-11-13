import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { QueuePauseChanged } from "../../../apps/web/shared/types";

// What the route refuses before bmo-job is ever called: a request that says neither yes nor no. Everything else
// about the switch — writing it, telling the queue on a resume — is bmo-job's, so what is checked here is that a
// good press reaches every queue as its new state.

const job = standIn("JOB", (one) =>
  one.method === "GET"
    ? answer({ items: [{ name: "default", state: "open", holds: [], leasedCount: 0, openCount: 0, changedAt: 0 }, { name: "jobs", state: "open", holds: [], leasedCount: 0, openCount: 0, changedAt: 0 }], more: false })
    : answer({ name: one.path.split("/")[2] ?? "default", state: one.body?.state, holds: [], leasedCount: 0, openCount: 0, changedAt: 0 })
);

const handler = await routeOf<QueuePauseChanged>("../../apps/web/server/api/queue-pause.post");

describe("pausing the auto-progression", () => {
  test("a press reaches every queue as its new state", async () => {
    job.asked.length = 0;

    expect((await asked(handler, { body: { paused: true } })).answer).toEqual({ ok: true, paused: true, queue: null, deployHold: false });
    // The queues are asked side by side, so they are read in no order.
    expect(job.asked.filter((one) => one.method === "PATCH").map((one) => one.path).sort()).toEqual(["/queues/default", "/queues/jobs"]);
    expect(job.asked.filter((one) => one.method === "PATCH").map((one) => one.body)).toEqual([{ state: "paused" }, { state: "paused" }]);

    expect((await asked(handler, { body: { paused: false } })).answer).toEqual({ ok: true, paused: false, queue: null, deployHold: false });
    expect(job.asked.filter((one) => one.method === "PATCH").at(-1)?.body).toEqual({ state: "open" });
  });

  test("a request that switches nothing is refused here, and bmo-job never hears it", async () => {
    job.asked.length = 0;

    expect(await asked(handler, { body: {} })).toMatchObject({ status: 400, message: wording("todo.error.queue_pause_direction") });
    expect(await asked(handler, { body: undefined })).toMatchObject({ status: 400 });
    expect(await asked(handler, { body: { paused: "true" } })).toMatchObject({ status: 400 });
    expect(job.asked).toEqual([]);
  });
});
