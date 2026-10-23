import { afterEach, describe, expect, test } from "bun:test";

import { keepaliveRound, switchAgentKeepalive, withKeepalive } from "../../../apps/web/server/utils/keepalive";

import type { AgentSummary } from "../../../apps/web/shared/types";

const held = globalThis.fetch;

// The warmer is reached at the address the setting names; every call is answered here instead.
process.env.CACHE_WARMER_ADDRESS = "http://warmer.test";

afterEach(() => {
  globalThis.fetch = held;
});

const asked: { url: string; method: string; body: unknown }[] = [];

// The shapes the warmer really writes (its docs/api.md): the round as `intervalMs`, `nextAt` and `running`,
// and each list as a page of `items`.
function answering(reply: (url: string) => unknown): void {
  asked.length = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    asked.push({ url, method: init?.method ?? "GET", body: init?.body === undefined ? null : JSON.parse(String(init.body)) });

    return Promise.resolve(new Response(JSON.stringify(reply(url)), { headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
}

function agent(name: string): AgentSummary {
  return {
    name,
    kind: "worker",
    sessionScope: null,
    turnShape: null,
    defaultAnswerer: false,
    model: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label: null,
    aliases: null,
    icon: null,
    cwd: "/repo",
    builtin: true,
    chatId: null,
    runs: 0,
    lastRunAt: null,
    lastKeepaliveAt: 1_700_000_000,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null
  };
}

describe("the warming round", () => {
  test("says the round stopped while the warmer is not running", async () => {
    answering(() => ({ intervalMs: 60_000, nextAt: 1_700_000_060_000, running: false }));
    expect(await keepaliveRound()).toEqual({ stopped: true });
    expect(asked).toEqual([{ url: "http://warmer.test/round", method: "GET", body: null }]);

    answering(() => ({ intervalMs: 60_000, nextAt: 1_700_000_060_000, running: true }));
    expect(await keepaliveRound()).toEqual({ stopped: false });
  });
});

describe("each agent's keepalive", () => {
  test("reads the subject's switch and pause, and the target's last warming, from the warmer's pages", async () => {
    answering((url) =>
      url.includes("/subjects")
        ? { items: [{ id: 1, consumerName: "agency", name: "worker", on: false, pausedAt: 1_700_000_000_000, pausedUntil: 9_007_199_254_740_991, targetCount: 1 }], more: false }
        : { items: [{ id: 1, consumerName: "agency", name: "chat-touch", subjectName: "worker", on: false, warmedAt: 1_700_000_100_000 }], more: false }
    );

    const [row] = await withKeepalive([agent("worker")], "agency");

    expect(row).toMatchObject({ keepaliveStopped: true, keepalivePausedAt: 1_700_000_000, lastKeepaliveAt: 1_700_000_100 });
    expect(asked.map((call) => call.url)).toEqual([
      "http://warmer.test/targets?limit=1000",
      "http://warmer.test/consumers/agency/subjects?limit=1000"
    ]);
  });

  test("reads an agent warming where one of its targets warms now, its switch unset or thrown on", async () => {
    answering((url) =>
      url.includes("/subjects")
        ? { items: [{ id: 1, consumerName: "agency", name: "worker", on: null, pausedAt: null, pausedUntil: null, targetCount: 2 }], more: false }
        : {
            items: [
              { id: 1, consumerName: "agency", name: "chat-touch", subjectName: "worker", on: false },
              { id: 2, consumerName: "agency", name: "chat-cache", subjectName: "worker", on: true }
            ],
            more: false
          }
    );

    const [row] = await withKeepalive([agent("worker")], "agency");

    expect(row).toMatchObject({ keepaliveStopped: false, keepalivePausedAt: null, lastKeepaliveAt: 1_700_000_000 });
  });

  test("reads an agent whose targets warm by default no more, and one the warmer holds no target of, as not warming", async () => {
    answering((url) =>
      url.includes("/subjects")
        ? { items: [{ id: 1, consumerName: "agency", name: "worker", on: null, pausedAt: null, pausedUntil: null, targetCount: 1 }], more: false }
        : { items: [{ id: 1, consumerName: "agency", name: "chat-touch", subjectName: "worker", on: false }], more: false }
    );

    const rows = await withKeepalive([agent("worker"), agent("other")], "agency");

    expect(rows.map((row) => row.keepaliveStopped)).toEqual([true, true]);
  });

  test("reads a target another consumer registered for the agent, and throws the switch under that consumer", async () => {
    answering((url) =>
      url.includes("/targets")
        ? { items: [{ id: 1, consumerName: "consumer-b", name: "chat-touch", subjectName: "worker", on: true }], more: false }
        : { items: [], more: false }
    );

    const [row] = await withKeepalive([agent("worker")], "agency");

    expect(row?.keepaliveStopped).toBe(false);
    expect(asked.map((call) => call.url)).toContain("http://warmer.test/consumers/consumer-b/subjects?limit=1000");

    await switchAgentKeepalive("agency", "worker", true);

    expect(asked.at(-1)).toEqual({ url: "http://warmer.test/consumers/consumer-b/subjects/worker", method: "PATCH", body: { on: false } });
  });

  test("throws the switch under the deployment's consumer for an agent no consumer holds a target for", async () => {
    answering(() => ({ items: [], more: false }));

    await switchAgentKeepalive("agency", "worker", false);

    expect(asked.at(-1)).toEqual({ url: "http://warmer.test/consumers/agency/subjects/worker", method: "PATCH", body: { on: true } });
  });

  test("reads every page of a list the warmer keeps", async () => {
    answering((url) => {
      if (!url.includes("/subjects")) return { items: [], more: false };
      if (url.includes("after=1")) return { items: [{ id: 2, consumerName: "agency", name: "other", on: false, pausedAt: null, targetCount: 0 }], more: false };

      return { items: [{ id: 1, consumerName: "agency", name: "worker", on: false, pausedAt: null, targetCount: 0 }], more: true };
    });

    const rows = await withKeepalive([agent("worker"), agent("other")], "agency");

    expect(rows.map((row) => row.keepaliveStopped)).toEqual([true, true]);
    expect(asked.map((call) => call.url)).toContain("http://warmer.test/consumers/agency/subjects?limit=1000&after=1");
  });

  test("makes no call and shows every switch down where the deployment names no consumer", async () => {
    answering(() => ({}));

    const [row] = await withKeepalive([agent("worker")], null);

    expect(row).toMatchObject({ keepaliveStopped: false, keepalivePausedAt: null });
    expect(asked).toEqual([]);
  });

  test("leaves every switch down where the warmer does not answer", async () => {
    asked.length = 0;
    globalThis.fetch = (() => Promise.reject(new TypeError("connection refused"))) as unknown as typeof fetch;

    const [row] = await withKeepalive([agent("worker")], "agency");

    expect(row).toMatchObject({ keepaliveStopped: false, keepalivePausedAt: null });
  });
});
