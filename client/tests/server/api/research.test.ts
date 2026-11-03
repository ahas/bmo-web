import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ResearchItem, ResearchQueuePage, ResearchRunDetail, ResearchSource, ResearchStateView } from "../../../apps/web/shared/research";

// The research screen's reads and changes (docs/web.md, 「Research screen」): the research unit's state with its
// categories, a category stopped and started again, its queue narrowed and paged with where each item came from, a
// thing asked for with its words and, for a follow-up, its parent, an item dismissed, a stuck item asked again or moved to
// the front, an item's research run with its log, and the sources registered, changed and taken away, each refusal
// said in the pack's words (bmo-research's docs/api.md, 「state」, 「categories」, 「queue」, 「research runs」 and
// 「sources」).

const CATEGORIES = [
  { name: "category-a", purpose: "first purpose", shape: "manual-or-investigation", cadenceMinutes: 60, gatherMinutes: null, provider: null, model: null, state: "running", stateAt: null, createdAt: 1 },
  { name: "category-b", purpose: "second purpose", shape: "brief", cadenceMinutes: 60, gatherMinutes: 1440, provider: "provider-a", model: "model-a", state: "stopped", stateAt: 5, createdAt: 2 }
];

const HOLD = { registration: "model-a", reason: "bench", since: 7, reported: false, categoryNames: ["category-b"] };

function stateOf(states: Record<string, string>) {
  return {
    state: Object.values(states).includes("running") ? "running" : "stopped",
    changedAt: 9,
    categories: [
      { categoryName: "category-a", state: states["category-a"], waitingCount: 2, runningCount: 1, finishingCount: 0, stuckCount: 3 },
      { categoryName: "category-b", state: states["category-b"], waitingCount: 0, runningCount: 0 }
    ],
    holds: [HOLD]
  };
}

function itemOf(id: number, state: string, extra: Record<string, unknown> = {}) {
  return {
    id, categoryName: "category-a", key: `key-${id}`, name: `item-${id}`, maker: null, address: `https://example.com/${id}`, kind: "model", shape: "manual",
    sourceId: null, asked: false, priority: 0, state, tries: 0, retryAt: null, runId: null, documentId: null, title: null, description: null, shareUrl: null,
    languages: [], narrations: [], fit: false, fitNodes: [], touches: null, plan: null, jobItemId: null, repairItemId: null, error: null, errorAt: null, foundAt: id, createdAt: id, changedAt: id, ...extra
  };
}

const RUN = {
  runId: 41, key: "search:thorough", query: "a question", asker: null, roomId: null, provider: "provider-a", model: "model-a", state: "running", outcome: null,
  startedAt: 10, closesAt: 20, finishedAt: null, documentId: null, link: null, error: null, branches: 2, turns: ["turn-a"]
};

function sourceOf(id: number) {
  return {
    id, categoryName: "category-a", kind: "rss", address: `https://example.com/feed-${id}`, query: null, filter: { require: [], exclude: [] }, everyMinutes: null, limit: 20,
    failureCount: 0, lastError: null, readAt: null, createdAt: id, changedAt: id
  };
}

const states: Record<string, string> = { "category-a": "running", "category-b": "stopped" };

const research = standIn("RESEARCH", (call) => {
  const path = call.path.split("?")[0] ?? "";

  if (path === "/state" && call.method === "GET") return answer(stateOf(states));

  if (path === "/state" && call.method === "PATCH") {
    const name = call.body?.categoryName;

    if (typeof name === "string" && !(name in states)) return answer({ code: "not-found", error: "no category holds that name" }, 404);

    for (const one of Object.keys(states)) if (name === undefined || name === one) states[one] = String(call.body?.state);

    return answer(stateOf(states));
  }

  if (path === "/categories") return answer({ items: CATEGORIES, more: false });

  if (path === "/queue" && call.method === "GET") {
    return answer({
      items: [
        itemOf(3, "running"),
        itemOf(1, "reported", { shareUrl: "https://example.com/doc", languages: ["ko", "en"], fit: true, origin: { kind: "source", source: "rss https://example.com/feed", because: null, itemId: null, documentId: null, title: null, shareUrl: null } }),
        itemOf(5, "waiting", { asked: true, origin: { kind: "follow-up", source: null, because: "why it is asked", itemId: 1, documentId: 11, title: "parent title", shareUrl: "https://example.com/parent" } }),
        itemOf(6, "stuck", { tries: 4, retryAt: 90, repairItemId: 812, error: "the run was cut off", errorAt: 70 })
      ],
      more: true
    });
  }

  if (path === "/queue" && call.method === "POST") {
    if (call.body?.name === "taken-name") return answer({ code: "conflict", error: "an item already waits for that key" }, 409);
    if (call.body?.followsItemId === 404) return answer({ code: "not-found", error: "no item stands at that id" }, 404);
    if (call.body?.followsItemId === 409) return answer({ code: "conflict", error: "that item has filed no document yet" }, 409);

    return answer(itemOf(7, "waiting", { name: call.body?.name, asked: true }), 201);
  }

  if (path === "/queue/1" && call.method === "PATCH") return answer(itemOf(1, "dismissed"));
  if (path === "/queue/2" && call.method === "PATCH") return answer({ code: "conflict", error: "a taken item is not dismissed" }, 409);
  if (path === "/queue/6" && call.method === "PATCH" && call.body?.state === "waiting") return answer(itemOf(6, "waiting", { tries: 0 }));
  if (path === "/queue/6" && call.method === "PATCH" && call.body?.front === true) return answer(itemOf(6, "stuck", { priority: 2, tries: 4, repairItemId: 812 }));
  if (path === "/queue/8" && call.method === "PATCH") return answer({ code: "conflict", error: "only a stuck item is asked again or moved so" }, 409);

  if (path === "/research-runs/41") return answer(RUN);
  if (path === "/research-runs/41/log-lines") return answer({ items: [{ id: 1, runId: 41, at: 11, kind: "asked", text: "asked" }, { id: 2, runId: 41, at: 12, kind: "seated", text: "seated" }] });
  if (path.startsWith("/research-runs/")) return answer({ code: "not-found", error: "no research run stands at that id" }, 404);

  if (path === "/sources" && call.method === "GET") {
    return call.path.includes("after=") ? answer({ items: [sourceOf(3)], more: false }) : answer({ items: [sourceOf(1), sourceOf(2)], more: true });
  }

  if (path === "/sources" && call.method === "POST") {
    if (call.body?.categoryName === "category-z") return answer({ code: "not-found", error: "no category holds that name" }, 404);
    if (call.body?.kind === "page") return answer({ code: "bad-request", error: "no kind the daemon reads" }, 400);

    return answer({ ...sourceOf(4), ...call.body }, 201);
  }

  if (path === "/sources/1" && call.method === "PATCH") return answer({ ...sourceOf(1), ...call.body });
  if (path === "/sources/1" && call.method === "DELETE") return new Response(null, { status: 204 });
  if (path.startsWith("/sources/")) return answer({ code: "not-found", error: "no source stands at that id" }, 404);

  return answer({ code: "no-route", error: "no route answers this method and path" }, 404);
}, { headers: true });

process.env.RESEARCH_TOKEN = "research-token";

const readState = await routeOf<ResearchStateView>("../../apps/web/server/api/research/state.get");
const changeState = await routeOf<ResearchStateView>("../../apps/web/server/api/research/state.patch");
const readQueue = await routeOf<ResearchQueuePage>("../../apps/web/server/api/research/queue.get");
const ask = await routeOf<ResearchItem>("../../apps/web/server/api/research/queue.post");
const changeItem = await routeOf<ResearchItem>("../../apps/web/server/api/research/queue/[id].patch");
const readRun = await routeOf<ResearchRunDetail>("../../apps/web/server/api/research/runs/[runId].get");
const readSources = await routeOf<{ items: ResearchSource[] }>("../../apps/web/server/api/research/sources.get");
const addSource = await routeOf<ResearchSource>("../../apps/web/server/api/research/sources.post");
const changeSource = await routeOf<ResearchSource>("../../apps/web/server/api/research/sources/[id].patch");
const removeSource = await routeOf<null>("../../apps/web/server/api/research/sources/[id].delete");

describe("reading the research state", () => {
  test("stands every category in the unit's order with its state, its part of the queue and its own settings, and the holds", async () => {
    const got = await asked(readState, {});

    expect(got.status).toBe(200);
    expect(got.answer?.state).toBe("running");
    expect(got.answer?.categories.map((one) => one.name)).toEqual(["category-a", "category-b"]);
    expect(got.answer?.categories[0]).toMatchObject({ purpose: "first purpose", waitingCount: 2, runningCount: 1, stuckCount: 3, state: "running", provider: null });
    expect(got.answer?.categories[1]).toMatchObject({ gatherMinutes: 1440, provider: "provider-a", model: "model-a", state: "stopped", stuckCount: 0 });
    expect(got.answer?.holds).toEqual([HOLD]);
    expect(research.asked.at(-1)?.headers?.authorization).toBe("Bearer research-token");
  });

  test("says the research unit does not answer where the console names no address for it", async () => {
    const address = process.env.RESEARCH_ADDRESS;

    delete process.env.RESEARCH_ADDRESS;

    try {
      expect(await asked(readState, {})).toMatchObject({ status: 503, message: wording("research.error.unreachable") });
    } finally {
      process.env.RESEARCH_ADDRESS = address;
    }
  });

  test("says the research unit does not answer where nothing takes the call", async () => {
    const address = process.env.RESEARCH_ADDRESS;

    process.env.RESEARCH_ADDRESS = "http://127.0.0.1:1";

    try {
      expect(await asked(readState, {})).toMatchObject({ status: 503, message: wording("research.error.unreachable") });
    } finally {
      process.env.RESEARCH_ADDRESS = address;
    }
  });
});

describe("stopping and resuming", () => {
  test("changes the one category named and answers the state as it now stands", async () => {
    const got = await asked(changeState, { body: { state: "stopped", categoryName: "category-a" } });

    expect(research.asked.find((call) => call.method === "PATCH" && call.path === "/state")?.body).toEqual({ state: "stopped", categoryName: "category-a" });
    expect(got.answer?.state).toBe("stopped");
    expect(got.answer?.categories.map((one) => one.state)).toEqual(["stopped", "stopped"]);
  });

  test("changes every category where none is named", async () => {
    const got = await asked(changeState, { body: { state: "running" } });

    expect(research.asked.filter((call) => call.method === "PATCH" && call.path === "/state").at(-1)?.body).toEqual({ state: "running" });
    expect(got.answer?.categories.map((one) => one.state)).toEqual(["running", "running"]);
  });

  test("says a category the unit does not hold in the pack's words", async () => {
    expect(await asked(changeState, { body: { state: "running", categoryName: "category-z" } })).toMatchObject({ status: 404, message: wording("research.error.no_category") });
  });

  test("refuses a state outside the two without calling the unit", async () => {
    const before = research.asked.length;

    expect(await asked(changeState, { body: { state: "paused" } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });
});

describe("reading the queue", () => {
  test("hands the category, the states, the place and the page's size on, and answers the items as the unit gave them", async () => {
    const got = await asked(readQueue, { query: { categoryName: "category-a", state: "waiting,running", after: "12", limit: "50" } });

    expect(research.asked.at(-1)?.path).toBe("/queue?categoryName=category-a&state=waiting%2Crunning&after=12&limit=50");
    expect(got.answer?.more).toBe(true);
    expect(got.answer?.items.map((item) => item.id)).toEqual([3, 1, 5, 6]);
    expect(got.answer?.items[1]).toMatchObject({ shareUrl: "https://example.com/doc", languages: ["ko", "en"], fit: true, state: "reported", repairItemId: null });
  });

  test("answers a stuck item with its tries, its retry wait, its last error and its repair job", async () => {
    const got = await asked(readQueue, { query: { state: "stuck" } });

    expect(research.asked.at(-1)?.path).toBe("/queue?state=stuck");
    expect(got.answer?.items[3]).toMatchObject({ state: "stuck", tries: 4, retryAt: 90, repairItemId: 812, error: "the run was cut off", errorAt: 70 });
  });

  test("answers where each item came from as the unit names it", async () => {
    const got = await asked(readQueue, { query: {} });

    expect(got.answer?.items[1]?.origin).toEqual({ kind: "source", source: "rss https://example.com/feed", because: null, itemId: null, documentId: null, title: null, shareUrl: null });
    expect(got.answer?.items[2]?.origin).toEqual({ kind: "follow-up", source: null, because: "why it is asked", itemId: 1, documentId: 11, title: "parent title", shareUrl: "https://example.com/parent" });
  });

  test("stands an item the unit answers with no origin as a scan's, its source unnamed", async () => {
    const got = await asked(readQueue, { query: {} });

    expect(got.answer?.items[0]?.origin).toEqual({ kind: "source", source: null, because: null, itemId: null, documentId: null, title: null, shareUrl: null });
  });

  test("asks the whole queue where nothing narrows it", async () => {
    await asked(readQueue, { query: {} });

    expect(research.asked.at(-1)?.path).toBe("/queue");
  });

  test("refuses a state the unit does not know or a place that is no number without calling the unit", async () => {
    const before = research.asked.length;

    expect(await asked(readQueue, { query: { state: "waiting,lost" } })).toMatchObject({ status: 400 });
    expect(await asked(readQueue, { query: { state: "failed" } })).toMatchObject({ status: 400 });
    expect(await asked(readQueue, { query: { after: "first" } })).toMatchObject({ status: 400 });
    expect(await asked(readQueue, { query: { limit: "500" } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });
});

describe("asking for a thing", () => {
  test("sends the category, the name and the address and answers the queued item", async () => {
    const got = await asked(ask, { body: { categoryName: "category-a", name: " thing-a ", address: "https://example.com/a" } });

    expect(research.asked.at(-1)).toMatchObject({ method: "POST", path: "/queue", body: { categoryName: "category-a", name: "thing-a", address: "https://example.com/a" } });
    expect(got.answer).toMatchObject({ id: 7, asked: true, state: "waiting" });
  });

  test("sends the owner's words and the parent a follow-up follows from", async () => {
    await asked(ask, { body: { categoryName: "category-a", name: "thing-b", address: "https://example.com/b", because: " why it is asked ", followsItemId: 1 } });

    expect(research.asked.at(-1)?.body).toEqual({ categoryName: "category-a", name: "thing-b", address: "https://example.com/b", because: "why it is asked", followsItemId: 1 });

    await asked(ask, { body: { categoryName: "category-a", name: "thing-c", address: "https://example.com/c", followsDocumentId: 11 } });

    expect(research.asked.at(-1)?.body).toEqual({ categoryName: "category-a", name: "thing-c", address: "https://example.com/c", followsDocumentId: 11 });
  });

  test("sends no words where the owner gave blank ones", async () => {
    await asked(ask, { body: { categoryName: "category-a", name: "thing-d", address: "https://example.com/d", because: "   " } });

    expect(research.asked.at(-1)?.body).toEqual({ categoryName: "category-a", name: "thing-d", address: "https://example.com/d" });
  });

  test("says a follow-up's missing parent, or one with no document yet, in the pack's words", async () => {
    const body = { categoryName: "category-a", name: "thing-e", address: "https://example.com/e" };

    expect(await asked(ask, { body: { ...body, followsItemId: 404 } })).toMatchObject({ status: 404, message: wording("research.error.follow_missing") });
    expect(await asked(ask, { body: { ...body, followsItemId: 409 } })).toMatchObject({ status: 409, message: wording("research.error.follow_conflict") });
  });

  test("refuses words that are no text or a parent that is no number without calling the unit", async () => {
    const before = research.asked.length;
    const body = { categoryName: "category-a", name: "thing-f", address: "https://example.com/f" };

    expect(await asked(ask, { body: { ...body, because: 3 } })).toMatchObject({ status: 400 });
    expect(await asked(ask, { body: { ...body, followsItemId: "1" } })).toMatchObject({ status: 400 });
    expect(await asked(ask, { body: { ...body, followsDocumentId: 0 } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });

  test("says the same thing already waiting in the pack's words", async () => {
    expect(await asked(ask, { body: { categoryName: "category-a", name: "taken-name", address: "https://example.com/a" } })).toMatchObject({ status: 409, message: wording("research.error.ask_conflict") });
  });

  test("refuses an ask missing its name or its address without calling the unit", async () => {
    const before = research.asked.length;

    expect(await asked(ask, { body: { categoryName: "category-a", name: "", address: "https://example.com/a" } })).toMatchObject({ status: 400 });
    expect(await asked(ask, { body: { categoryName: "category-a", name: "thing-a" } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });
});

describe("dismissing an item", () => {
  test("sends the dismissal alone and answers the item as the unit now holds it", async () => {
    const got = await asked(changeItem, { params: { id: "1" }, body: { state: "dismissed" } });

    expect(research.asked.at(-1)).toMatchObject({ method: "PATCH", path: "/queue/1", body: { state: "dismissed" } });
    expect(got.answer?.state).toBe("dismissed");
  });

  test("says an item the unit no longer dismisses in the pack's words", async () => {
    expect(await asked(changeItem, { params: { id: "2" }, body: { state: "dismissed" } })).toMatchObject({ status: 409, message: wording("research.error.dismiss_conflict") });
  });

  test("refuses any other change, or an id that is no number, without calling the unit", async () => {
    const before = research.asked.length;

    expect(await asked(changeItem, { params: { id: "1" }, body: { state: "taken", jobItemId: 3 } })).toMatchObject({ status: 400 });
    expect(await asked(changeItem, { params: { id: "1" }, body: { front: false } })).toMatchObject({ status: 400 });
    expect(await asked(changeItem, { params: { id: "1" }, body: { state: "waiting", front: true } })).toMatchObject({ status: 400 });
    expect(await asked(changeItem, { params: { id: "one" }, body: { state: "dismissed" } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });
});

describe("a stuck item", () => {
  test("is asked again afresh with a waiting state alone, and stands as the unit answers it", async () => {
    const got = await asked(changeItem, { params: { id: "6" }, body: { state: "waiting" } });

    expect(research.asked.at(-1)).toMatchObject({ method: "PATCH", path: "/queue/6", body: { state: "waiting" } });
    expect(got.answer).toMatchObject({ id: 6, state: "waiting", tries: 0, repairItemId: null });
  });

  test("is moved to the front with front alone, and stands as the unit answers it", async () => {
    const got = await asked(changeItem, { params: { id: "6" }, body: { front: true } });

    expect(research.asked.at(-1)).toMatchObject({ method: "PATCH", path: "/queue/6", body: { front: true } });
    expect(got.answer).toMatchObject({ id: 6, state: "stuck", repairItemId: 812 });
  });

  test("says an item no longer stuck in the pack's words for what was asked", async () => {
    expect(await asked(changeItem, { params: { id: "8" }, body: { state: "waiting" } })).toMatchObject({ status: 409, message: wording("research.error.reask_conflict") });
    expect(await asked(changeItem, { params: { id: "8" }, body: { front: true } })).toMatchObject({ status: 409, message: wording("research.error.front_conflict") });
  });
});

describe("reading an item's run", () => {
  test("answers the run with its log, oldest first", async () => {
    const got = await asked(readRun, { params: { runId: "41" } });

    expect(got.answer?.run).toMatchObject({ runId: 41, key: "search:thorough", state: "running", branches: 2, closesAt: 20 });
    expect(got.answer?.lines.map((line) => line.kind)).toEqual(["asked", "seated"]);
  });

  test("says a run the unit does not hold in the pack's words", async () => {
    expect(await asked(readRun, { params: { runId: "99" } })).toMatchObject({ status: 404, message: wording("research.error.no_run") });
  });
});

describe("the sources", () => {
  test("reads every page of them, by id", async () => {
    const got = await asked(readSources, {});

    expect(got.answer?.items.map((source) => source.id)).toEqual([1, 2, 3]);
    expect(research.asked.filter((call) => call.path.startsWith("/sources")).slice(-2).map((call) => call.path)).toEqual(["/sources?limit=200", "/sources?limit=200&after=2"]);
  });

  test("registers one with what was written, and says a category the unit does not hold or a kind it does not read", async () => {
    const got = await asked(addSource, { body: { categoryName: "category-a", kind: "arxiv", query: " cat:cs.CL ", filter: { require: ["gguf"], exclude: [] }, limit: 10 } });

    expect(research.asked.at(-1)).toMatchObject({ method: "POST", path: "/sources", body: { categoryName: "category-a", kind: "arxiv", query: "cat:cs.CL", filter: { require: ["gguf"], exclude: [] }, limit: 10 } });
    expect(got.answer?.kind).toBe("arxiv");
    expect(await asked(addSource, { body: { categoryName: "category-z", kind: "rss", address: "https://example.com/feed" } })).toMatchObject({ status: 404, message: wording("research.error.no_category") });
    expect(await asked(addSource, { body: { categoryName: "category-a", kind: "page", address: "https://example.com" } })).toMatchObject({ status: 400, message: wording("research.error.source_refused") });
  });

  test("changes one with only the fields the change takes, and refuses any other without calling the unit", async () => {
    const got = await asked(changeSource, { params: { id: "1" }, body: { everyMinutes: 30 } });

    expect(research.asked.at(-1)).toMatchObject({ method: "PATCH", path: "/sources/1", body: { everyMinutes: 30 } });
    expect(got.answer?.everyMinutes).toBe(30);

    const before = research.asked.length;

    expect(await asked(changeSource, { params: { id: "1" }, body: { kind: "rss" } })).toMatchObject({ status: 400 });
    expect(await asked(changeSource, { params: { id: "1" }, body: {} })).toMatchObject({ status: 400 });
    expect(await asked(changeSource, { params: { id: "1" }, body: { limit: "ten" } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });

  test("takes one away, and says a source the unit does not hold in the pack's words", async () => {
    expect(await asked(removeSource, { params: { id: "1" } })).toMatchObject({ status: 200, answer: null });
    expect(research.asked.at(-1)).toMatchObject({ method: "DELETE", path: "/sources/1" });
    expect(await asked(removeSource, { params: { id: "9" } })).toMatchObject({ status: 404, message: wording("research.error.no_source") });
  });
});
