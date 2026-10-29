import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// The registered models as the console asks them of the agency (the agency's docs/api.md, 「providers,
// models, pin-checks, tiers and fallback」): the list at `/models`, a create at `/models`, and a change and
// a take-away on `/models/{modelKey}`. What the console refuses is only a request that names no key or no
// model, since the agency would refuse it the same.

const held = { key: "registered::model-a-0-1", provider: "registered", model: "RVN-model", tier: "large", healthy: true, lastAnsweredAt: null };

const agency = standIn("AGENCY", (call) =>
  call.method === "POST" && call.body?.name === "registered::taken"
    ? answer({ code: "conflict", error: "a model is already registered as taken" }, 409)
    : call.method === "DELETE"
      ? new Response(null, { status: 204 })
      : call.method === "GET" && call.path === "/models"
        ? answer({ items: [held], more: false })
        : answer(held)
);
const calls = agency.asked;

const list = await routeOf<unknown>("../../apps/web/server/api/models.get");
const create = await routeOf<unknown>("../../apps/web/server/api/models.post");
const patch = await routeOf<unknown>("../../apps/web/server/api/models/[modelKey].patch");
const remove = await routeOf<unknown>("../../apps/web/server/api/models/[modelKey].delete");

describe("listing the registered models", () => {
  test("reads the agency's model resource and answers its page as it came", async () => {
    calls.length = 0;

    expect(await asked(list, {})).toMatchObject({ status: 200, answer: { items: [held], more: false } });
    expect(calls).toEqual([{ method: "GET", path: "/models", body: null }]);
  });
});

describe("registering a model", () => {
  test("carries the key and the model behind it to the agency", async () => {
    calls.length = 0;

    expect(await asked(create, { body: { key: " registered::model-a-0-1 ", model: " RVN-model " } })).toMatchObject({ status: 200, answer: held });
    expect(calls).toMatchObject([{ method: "POST", path: "/models", body: { action: "add", name: "registered::model-a-0-1", model: "RVN-model" } }]);
  });

  test("says the agency's conflict when the name already stands", async () => {
    calls.length = 0;

    const refused = await asked(create, { body: { key: "registered::taken", model: "RVN-model" } });

    expect(refused.status).toBe(409);
    expect(refused.message).toBe(wording("agents.error.agency_conflict"));
  });

  test("refuses a request that names no key or no model without calling the agency", async () => {
    calls.length = 0;

    for (const body of [{}, { key: "registered::model-a-0-1" }, { model: "RVN-model" }, { key: 1, model: "RVN-model" }]) {
      expect(await asked(create, { body })).toMatchObject({ status: 400, message: wording("agents.error.registry_value") });
    }
    expect(calls).toEqual([]);
  });
});

describe("changing a model", () => {
  test("changes the model behind the registration, named by its key", async () => {
    calls.length = 0;

    expect(await asked(patch, { params: { modelKey: "model-a-0-1" }, body: { model: " RVN-model-2 " } })).toMatchObject({ status: 200, answer: held });
    expect(calls).toMatchObject([{ method: "PATCH", path: "/models/model-a-0-1", body: { action: "change", model: "RVN-model-2" } }]);
  });

  test("refuses a change that names no model, or no registration in the path", async () => {
    calls.length = 0;

    expect(await asked(patch, { params: { modelKey: "model-a-0-1" }, body: {} })).toMatchObject({ status: 400 });
    expect(await asked(patch, { params: { modelKey: "" }, body: { model: "RVN-model" } })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });
});

describe("taking a model away", () => {
  test("deletes the registration by its key and answers nothing", async () => {
    calls.length = 0;

    expect(await asked(remove, { params: { modelKey: "model-a-0-1" } })).toMatchObject({ status: 200, answer: null });
    expect(calls).toEqual([{ method: "DELETE", path: "/models/model-a-0-1", body: null }]);
  });

  test("refuses a take-away that names no registration", async () => {
    calls.length = 0;

    expect(await asked(remove, { params: {} })).toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });
});
