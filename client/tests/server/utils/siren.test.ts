import { afterEach, describe, expect, test } from "bun:test";

import { SIREN_MAX, SIREN_PAGE_SIZE } from "../../../apps/web/shared/config";
import { readSiren, sirenAgentOf } from "../../../apps/web/server/utils/siren";

const held = globalThis.fetch;
const globals: Record<string, unknown> = globalThis;

// The siren is reached at the address the setting names; every call is answered here instead.
process.env.CACHE_SIREN_ADDRESS = "http://siren.test";

afterEach(() => {
  globalThis.fetch = held;
});

// The moment the figures are counted from, held still so a minute's bucket is where the test puts it.
const NOW = 1_792_600_000_000;
const MINUTE = 60_000;

// Every address the siren was asked at, with the accept a call carried: how far back the screen asked
// and whether it asked for a page rather than the stream are both part of what is checked here.
const asked: { url: string; accept: string | null }[] = [];

function answering(answers: { stats?: unknown; settings?: unknown; events?: unknown }): void {
  asked.length = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    asked.push({ url, accept: new Headers(init?.headers).get("accept") });

    const body = url.includes("/stats") ? answers.stats : url.includes("/settings") ? answers.settings : answers.events;

    return Promise.resolve(new Response(JSON.stringify(body ?? {}), { headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
}

// The shapes the daemon really writes (its docs/api.md): sums by session, three settings, and a page of
// events whose data is a Usage or a Siren.
const stats = {
  since: NOW - 30 * MINUTE,
  sirenCount: 3,
  sessions: [
    {
      sessionId: "alpha",
      projectName: "home-user-checkouts-web",
      harnessName: "claude-code",
      modelName: "claude-opus-5",
      requestCount: 5,
      newTokenCount: 4_000,
      cachedTokenCount: 96_000,
      outputTokenCount: 0,
      cachedShare: 0.96,
      coldCount: 2,
      firstAt: NOW - 20 * MINUTE,
      lastAt: NOW - 5 * MINUTE
    },
    {
      sessionId: "beta",
      projectName: "home-user-checkouts-web",
      harnessName: "codex",
      modelName: "gpt-5.6",
      requestCount: 1,
      newTokenCount: 1_000,
      cachedTokenCount: 0,
      outputTokenCount: 0,
      cachedShare: 0,
      coldCount: 1,
      firstAt: NOW - 45 * MINUTE,
      lastAt: NOW - 45 * MINUTE
    }
  ]
};

const settings = { armed: true, ttlMs: 3_600_000, threshold: 100_000 };

function usage(id: number, at: number, over: Record<string, unknown> = {}): unknown {
  return {
    id,
    at,
    kind: "usage.created",
    data: {
      sessionId: "alpha",
      modelName: "claude-opus-5",
      at,
      harnessName: "claude-code",
      backend: "anthropic",
      kind: "warm",
      level: "info",
      note: "",
      newTokenCount: 648,
      cachedTokenCount: 814_029,
      projectName: "home-user-checkouts-web",
      directoryName: "web",
      scope: "the caller's own",
      actorName: "the caller's own",
      labels: {},
      ...over
    }
  };
}

function siren(id: number, at: number): unknown {
  return {
    id,
    at,
    kind: "siren.sounded",
    data: { kind: "burst", at, sessionId: null, projectName: "home-user-checkouts-web,home-user-agents-search", newTokenCount: 600_000, cachedTokenCount: 0, requestCount: 119, note: "119 req in 60s", parts: [], audible: true }
  };
}

const events = {
  items: [
    usage(1, NOW - 15 * MINUTE, { newTokenCount: 5_000 }),
    usage(2, NOW - 90_000, { newTokenCount: 1_000 }),
    siren(3, NOW - 60_000),
    { id: 4, at: NOW - 45_000, kind: "settings.changed", data: settings },
    usage(5, NOW - 30_000, { newTokenCount: 648 })
  ],
  more: false
};

describe("where the siren is asked", () => {
  test("at the address the setting names, and nowhere where it names none", async () => {
    answering({ stats, settings, events });
    await readSiren(SIREN_PAGE_SIZE, NOW);

    expect(asked.map((call) => call.url.split("?")[0])).toEqual(["http://siren.test/stats", "http://siren.test/settings", "http://siren.test/events"]);
    // The page is asked for outright: without the accept the route holds a stream open and never answers.
    expect(asked.find((call) => call.url.includes("/events"))?.accept).toBe("application/json");

    delete process.env.CACHE_SIREN_ADDRESS;
    answering({ stats, settings, events });

    try {
      expect((await readSiren(SIREN_PAGE_SIZE, NOW)).reachable).toBe(false);
      expect(asked).toEqual([]);
    } finally {
      process.env.CACHE_SIREN_ADDRESS = "http://siren.test";
    }
  });
});

describe("what the siren's sums become", () => {
  test("the window's sums, its siren count and its settings, under the names the screen uses", async () => {
    answering({ stats, settings, events });

    const watch = await readSiren(SIREN_PAGE_SIZE, NOW);

    expect(watch).toMatchObject({
      reachable: true,
      since: NOW - 30 * MINUTE,
      sirenCount: 3,
      sessions30m: 1,
      coldCount: 3,
      settings: { armed: true, ttlMs: 3_600_000, threshold: 100_000 }
    });
    // Cached tokens over cached and new: 96,000 over 101,000.
    expect(watch.cacheShare).toBeCloseTo(96_000 / 101_000, 10);
  });

  test("the last minute and the last ten, counted from the events the siren hands back", async () => {
    answering({ stats, settings, events });

    const watch = await readSiren(SIREN_PAGE_SIZE, NOW);

    // The request 30 seconds old is inside the minute; the one 90 seconds old is not.
    expect(watch.newLastMinute).toBe(648);
    expect(watch.perMinute).toHaveLength(10);
    // A bucket a minute, oldest first: the current minute is the last, the one before it the one before.
    expect(watch.perMinute[9]).toBe(648);
    expect(watch.perMinute[8]).toBe(1_000);
    // A request older than the ten minutes falls outside every bucket.
    expect(watch.perMinute.reduce((total, one) => total + one, 0)).toBe(1_648);
  });

  test("a siren that has summed nothing leaves the share empty rather than zero", async () => {
    answering({ stats: { since: NOW, sirenCount: 0, sessions: [] }, settings, events: { items: [], more: false } });

    expect((await readSiren(SIREN_PAGE_SIZE, NOW)).cacheShare).toBeNull();
  });

  test("a field the siren did not send says nothing rather than breaking the screen", async () => {
    answering({ stats: {}, settings: {}, events: { items: [{ id: 9, kind: "usage.created", data: {} }], more: false } });

    const watch = await readSiren(SIREN_PAGE_SIZE, NOW);

    expect(watch.reachable).toBe(true);
    expect(watch.settings).toEqual({ armed: false, ttlMs: 0, threshold: 0 });
    expect(watch.events[0]).toMatchObject({ seq: 9, atSeconds: null, kind: "", newTokens: 0, mode: "claude-code" });
  });

  test("a siren that is not there leaves the screen readable and empty", async () => {
    globals.fetch = () => Promise.reject(new Error("ECONNREFUSED"));

    expect(await readSiren(SIREN_PAGE_SIZE, NOW)).toMatchObject({ reachable: false, events: [], sirenCount: 0, sessions30m: 0 });
  });

  test("and so does one that answers with an error", async () => {
    globals.fetch = () => Promise.resolve(new Response("nope", { status: 500 }));

    expect((await readSiren(SIREN_PAGE_SIZE, NOW)).reachable).toBe(false);
  });
});

describe("one event as the screen reads it", () => {
  test("a request, newest first, with its seconds whole and its harness in the console's names", async () => {
    answering({ stats, settings, events });

    const [newest, burst, older] = (await readSiren(SIREN_PAGE_SIZE, NOW)).events;

    expect(newest).toEqual({
      seq: 5,
      atSeconds: Math.floor((NOW - 30_000) / 1000),
      project: "home-user-checkouts-web",
      session: "alpha",
      agent: null,
      mode: "claude-code",
      model: "claude-opus-5",
      kind: "warm",
      level: "info",
      note: "",
      // What moved a prefix is the agency's record, served by no route, so no request carries a cause.
      cause: null,
      newTokens: 648,
      readTokens: 814_029
    });
    // A siren's own row was raised by a burst, and no harness made it.
    expect(burst).toMatchObject({ seq: 3, kind: "burst", level: "red", mode: null, model: "", note: "119 req in 60s", newTokens: 600_000 });
    expect(older).toMatchObject({ seq: 2, kind: "warm", newTokens: 1_000 });
  });

  test("a settings change is a fact about the siren, not a request", async () => {
    answering({ stats, settings, events });

    const seqs = (await readSiren(SIREN_PAGE_SIZE, NOW)).events.map((event) => event.seq);

    expect(seqs).toEqual([5, 3, 2, 1]);
  });

  test("a request keeps only the first characters of its session's number", async () => {
    answering({ stats, settings, events: { items: [usage(1, NOW, { sessionId: "0123456789abcdef" })], more: false } });

    expect((await readSiren(SIREN_PAGE_SIZE, NOW)).events[0]?.session).toBe("01234567");
  });
});

describe("which agent a request belongs to", () => {
  test("a runner is known by the directory of its own name it works in", () => {
    expect(sirenAgentOf({ project: "home-user-agents-search", directory: "search" })).toBe("search");
    expect(sirenAgentOf({ project: "home-user-agents-browse", directory: "browse" })).toBe("browse");
  });

  test("a directory of that name inside a checkout is not a runner", () => {
    expect(sirenAgentOf({ project: "home-user-checkouts-a", directory: "search" })).toBeNull();
  });

  test("anything else is left unnamed rather than guessed at, since which agent holds a session is served by no route", () => {
    expect(sirenAgentOf({})).toBeNull();
    expect(sirenAgentOf({ project: "home-user-checkouts-a", directory: "a" })).toBeNull();
    // The caller's own fields are opaque to the siren and name no agent.
    expect(sirenAgentOf({ project: "home-user-checkouts-web", directory: "web" })).toBeNull();
  });
});

// Scrolling to the foot of the list is what asks for more, and asking for more is asking the screen's server
// for a bigger slice of the page it holds: the siren keeps a ring rather than a history, so there is no cursor
// to read from. The siren is read whole so the ten minutes are complete; the page is what grows.
describe("how far back the feed is read", () => {
  function ring(count: number): unknown {
    return { items: Array.from({ length: count }, (_, i) => usage(i + 1, NOW - (count - 1 - i) * 1_000)), more: false };
  }

  test("the siren is read whole, and the screen is handed one page of it", async () => {
    answering({ stats, settings, events: ring(SIREN_PAGE_SIZE * 2) });

    const watch = await readSiren(SIREN_PAGE_SIZE, NOW);

    expect(asked.some((call) => call.url.includes(`/events?limit=${SIREN_MAX}`))).toBe(true);
    expect(watch.events).toHaveLength(SIREN_PAGE_SIZE);
    expect(watch.hasMore).toBe(true);
  });

  test("and the screen may ask for more than one", async () => {
    answering({ stats, settings, events: ring(SIREN_PAGE_SIZE * 2) });

    const watch = await readSiren(SIREN_PAGE_SIZE * 2, NOW);

    expect(watch.events).toHaveLength(SIREN_PAGE_SIZE * 2);
    expect(watch.hasMore).toBe(false);
  });

  test("standing at the ring's own ceiling is standing at the end", async () => {
    answering({ stats, settings, events: ring(SIREN_MAX) });

    const watch = await readSiren(SIREN_MAX * 4, NOW);

    expect(asked.some((call) => call.url.includes(`/events?limit=${SIREN_MAX}`))).toBe(true);
    expect(watch.hasMore).toBe(false);
  });

  test("a siren that does not answer has nothing more to give", async () => {
    globals.fetch = () => Promise.reject(new Error("not there"));

    const watch = await readSiren(SIREN_PAGE_SIZE, NOW);

    expect(watch.reachable).toBe(false);
    expect(watch.hasMore).toBe(false);
    expect(watch.events).toEqual([]);
  });

  test("what comes back is one feed, newest first, with no row twice", async () => {
    answering({ stats, settings, events: ring(SIREN_PAGE_SIZE * 2) });

    const watch = await readSiren(SIREN_PAGE_SIZE * 2, NOW);
    const seqs = watch.events.map((event) => event.seq);

    expect(seqs).toHaveLength(SIREN_PAGE_SIZE * 2);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs[0]).toBeGreaterThan(seqs[seqs.length - 1] as number);
  });
});
