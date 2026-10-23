import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// The keepalive switched at the cache warmer (the cache warmer's docs/api.md, "Routes"): the round as a whole,
// one agent's subject under the consumer the deployment names, or one worker's pause until its next job. The
// round is changed by a merge patch of `running`, a subject by one of `on` or `pausedUntil`. What the route
// refuses is only a request that says nothing — no yes or no, or a name no agent could have — since the round
// trip would answer the same.

process.env.KEEPALIVE_CONSUMER = "agency";

// No consumer registers a target for the agents here, so a subject is switched under the deployment's own.
const warmer = standIn("CACHE_WARMER", (call) =>
  answer(
    call.path === "/round"
      ? { intervalMs: 60_000, nextAt: 0, running: call.body?.running ?? true }
      : call.path.startsWith("/targets")
        ? { items: [], more: false }
        : { id: 1, consumerName: "agency", name: "worker-b", on: null, pausedAt: null, pausedUntil: null, targetCount: 0 }
  )
);

// What the route changed at the warmer, past the reads it made to find where.
const changed = () => warmer.asked.filter((call) => call.method !== "GET");
const handler = await routeOf<{ ok: true }>("../../apps/web/server/api/keepalive.post");

describe("stopping the keepalive", () => {
  test("stops the whole round when no agent is named, and one agent's subject when one is", async () => {
    warmer.asked.length = 0;

    expect(await asked(handler, { body: { stopped: true } })).toMatchObject({ status: 200 });
    expect(changed()[0]).toEqual({ method: "PATCH", path: "/round", body: { running: false } });

    expect(await asked(handler, { body: { agent: "chat:-1001", stopped: false } })).toMatchObject({ status: 200 });
    expect(changed()[1]).toEqual({ method: "PATCH", path: "/consumers/agency/subjects/chat%3A-1001", body: { on: true } });
  });

  test("refuses a request that switches nothing, and a name no agent could have", async () => {
    warmer.asked.length = 0;

    expect(await asked(handler, { body: {} })).toMatchObject({ status: 400 });
    expect(await asked(handler, { body: { stopped: "true" } })).toMatchObject({ status: 400 });
    expect(await asked(handler, { body: { agent: "../worker", stopped: true } })).toMatchObject({ status: 400 });
    expect(warmer.asked).toEqual([]);
  });
});

describe("turning a worker's keepalive off until its next job", () => {
  test("pauses the worker's subject and nothing else", async () => {
    warmer.asked.length = 0;

    expect(await asked(handler, { body: { agent: "worker-b", pause: true, stopped: true } })).toMatchObject({ status: 200 });
    expect(changed()).toEqual([{ method: "PATCH", path: "/consumers/agency/subjects/worker-b", body: { pausedUntil: Number.MAX_SAFE_INTEGER } }]);
  });

  test("refuses a pause that names no worker", async () => {
    warmer.asked.length = 0;

    expect(await asked(handler, { body: { pause: true } })).toMatchObject({ status: 400 });
    expect(await asked(handler, { body: { agent: "../worker-b", pause: true } })).toMatchObject({ status: 400 });
    expect(warmer.asked).toEqual([]);
  });
});
