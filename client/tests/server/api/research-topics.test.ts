import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ResearchStateView } from "../../../apps/web/shared/research";

// The research screen's topics (docs/web.md, 「Research screen」, the topics tab): a topic registered as a category of the shape
// `topic`, changed and taken away through the research unit's category routes, a category of another shape left
// alone, and each refusal said in the pack's words (bmo-research's docs/api.md, 「categories」).

const TOPIC = {
  name: "topic-a", purpose: "what moves", shape: "topic", cadenceMinutes: 60, gatherMinutes: 720, provider: null, model: null, instruction: "Gather what moved.",
  calendar: { realm: "organization", calendarId: "calendar-a" }, state: "running", stateAt: null, createdAt: 1
};
const OTHER = { name: "category-a", purpose: "first purpose", shape: "brief", cadenceMinutes: 60, gatherMinutes: 1440, provider: null, model: null, instruction: null, calendar: null, state: "running", stateAt: null, createdAt: 2 };
const STATE = { state: "running", changedAt: null, categories: [{ categoryName: "topic-a", state: "running", waitingCount: 1, runningCount: 0, stuckCount: 0 }], holds: [] };

const research = standIn("RESEARCH", (call) => {
  const path = decodeURIComponent(call.path.split("?")[0] ?? "");

  if (path === "/state") return answer(STATE);
  if (path === "/categories" && call.method === "GET") return answer({ items: [TOPIC, OTHER], more: false });

  if (path === "/categories" && call.method === "POST") {
    if (call.body?.name === "topic-a") return answer({ code: "conflict", error: "The name is taken." }, 409);
    if (call.body?.name === "Bad") return answer({ code: "bad-request", error: "A name is lower-case." }, 400);

    return answer({ ...TOPIC, ...call.body }, 201);
  }

  if (path === "/categories/topic-a" && call.method === "GET") return answer(TOPIC);
  if (path === "/categories/category-a" && call.method === "GET") return answer(OTHER);
  if (path === "/categories/topic-a" && call.method === "PATCH") return answer({ ...TOPIC, ...call.body });
  if (path === "/categories/topic-a" && call.method === "DELETE") return answer({ code: "conflict", error: "A source still names it." }, 409);

  return answer({ code: "not-found", error: "no category" }, 404);
});

const state = await routeOf<ResearchStateView>("../../apps/web/server/api/research/state.get");
const add = await routeOf<ResearchStateView>("../../apps/web/server/api/research/topics.post");
const change = await routeOf<ResearchStateView>("../../apps/web/server/api/research/topics/[name].patch");
const remove = await routeOf<ResearchStateView>("../../apps/web/server/api/research/topics/[name].delete");

const writes = (): { method: string; path: string; body: Record<string, unknown> | null }[] => research.asked.filter((one) => one.method !== "GET").map((one) => ({ method: one.method, path: one.path, body: one.body }));

describe("the topics", () => {
  test("stand among the categories with their own instruction and calendar, another shape with neither", async () => {
    const got = await asked(state, {});

    expect(got.answer?.categories[0]).toMatchObject({ name: "topic-a", shape: "topic", gatherMinutes: 720, instruction: "Gather what moved.", calendar: { realm: "organization", calendarId: "calendar-a" }, waitingCount: 1 });
    expect(got.answer?.categories[1]).toMatchObject({ name: "category-a", instruction: null, calendar: null });
  });

  test("are registered as categories of the shape topic, and the categories answered as they now stand", async () => {
    research.asked.length = 0;

    const got = await asked(add, { body: { name: " topic-b ", purpose: "a purpose", instruction: " Look for it. ", gatherMinutes: 1440, calendar: { realm: "mine", calendarId: "calendar-b" } } });

    expect(got.status).toBe(200);
    expect(got.answer?.categories.map((one) => one.name)).toEqual(["topic-a", "category-a"]);
    expect(writes()).toEqual([{ method: "POST", path: "/categories", body: { name: "topic-b", purpose: "a purpose", instruction: "Look for it.", gatherMinutes: 1440, calendar: { realm: "mine", calendarId: "calendar-b" }, shape: "topic" } }]);
  });

  test("are refused before they go where a body misses a field or names one of another shape", async () => {
    research.asked.length = 0;

    for (const body of [
      null,
      { purpose: "a purpose", instruction: "x" },
      { name: "topic-b", instruction: "x" },
      { name: "topic-b", purpose: "a purpose", instruction: "  " },
      { name: "topic-b", purpose: "a purpose", instruction: "x", gatherMinutes: 0 },
      { name: "topic-b", purpose: "a purpose", instruction: "x", calendar: { realm: "theirs", calendarId: "c" } },
      { name: "topic-b", purpose: "a purpose", instruction: "x", calendar: { realm: "mine", calendarId: " " } },
      { name: "topic-b", purpose: "a purpose", instruction: "x", calendar: null }
    ]) {
      expect(await asked(add, { body })).toMatchObject({ status: 400, message: wording("common.error.bad_action") });
    }
    expect(research.asked).toEqual([]);
  });

  test("say the unit's refusal of a registration in the pack's words", async () => {
    expect(await asked(add, { body: { name: "topic-a", purpose: "p", instruction: "x" } })).toMatchObject({ status: 409, message: wording("research.error.topic_taken") });
    expect(await asked(add, { body: { name: "Bad", purpose: "p", instruction: "x" } })).toMatchObject({ status: 400, message: wording("research.error.topic_refused") });
  });

  test("are changed by what the change names, a calendar given as null taken away", async () => {
    research.asked.length = 0;

    expect((await asked(change, { params: { name: "topic-a" }, body: { instruction: "Gather more.", gatherMinutes: 60, calendar: null } })).status).toBe(200);
    expect(writes()).toEqual([{ method: "PATCH", path: "/categories/topic-a", body: { instruction: "Gather more.", gatherMinutes: 60, calendar: null } }]);

    for (const body of [{}, { instruction: "" }, { gatherMinutes: 1.5 }, { calendar: { realm: "mine" } }]) {
      expect(await asked(change, { params: { name: "topic-a" }, body })).toMatchObject({ status: 400 });
    }
  });

  test("leave a category of another shape alone, and one the unit does not hold", async () => {
    research.asked.length = 0;

    expect(await asked(change, { params: { name: "category-a" }, body: { purpose: "x" } })).toMatchObject({ status: 404, message: wording("research.error.no_category") });
    expect(await asked(remove, { params: { name: "category-a" } })).toMatchObject({ status: 404, message: wording("research.error.no_category") });
    expect(await asked(remove, { params: { name: "nothing" } })).toMatchObject({ status: 404, message: wording("research.error.no_category") });
    expect(writes()).toEqual([]);
  });

  test("say a topic still held by a source or an item in the pack's words", async () => {
    expect(await asked(remove, { params: { name: "topic-a" } })).toMatchObject({ status: 409, message: wording("research.error.topic_held") });
  });
});
