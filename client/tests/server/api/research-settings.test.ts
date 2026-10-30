import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { ResearchSettingsView } from "../../../apps/web/shared/research";

// The research settings as the searcher tab reads and changes them (docs/web.md, the searcher tab): the research
// unit's `GET /research-settings` with the agency's co-worker roles beside it, and one setting changed through its
// `PUT`, sent as it stands since the unit keeps every field a change leaves out (bmo-research's docs/api.md,
// 「research-settings」).

const SETTINGS = {
  branchRole: "role-a", strategy: "direct-then-browser", hostIntervalMs: null, engineIntervalMs: 250,
  keys: [{ key: "search:basic", branches: 0, minutes: 5, pages: 3, branchPages: null }], source: "default",
  engines: [{ name: "engine-a", category: "general", state: "healthy", reason: null, observedAt: 1_000, suspendedUntil: null }], enginesUnread: null
};

const research = standIn("RESEARCH", (call) => {
  if (call.path !== "/research-settings") return answer({ code: "no-route", error: "no route answers this method and path" }, 404);
  if (call.method === "PUT" && call.body?.strategy === "sideways") return answer({ code: "bad-request", error: "a strategy outside the three" }, 400);
  if (call.method === "PUT") return answer({ ...SETTINGS, ...call.body, source: "set" });

  return answer(SETTINGS);
}, { headers: true });

const agency = standIn("AGENCY", (call) => (call.path === "/roles" ? answer({ items: [{ name: "role-a" }, { name: "role-b" }], more: false }) : answer({ code: "not-found" }, 404)));

process.env.RESEARCH_TOKEN = "research-token";

const read = await routeOf<ResearchSettingsView>("../../apps/web/server/api/research-settings.get");
const change = await routeOf<ResearchSettingsView>("../../apps/web/server/api/research-settings.put");

describe("reading the research settings", () => {
  test("reads the research unit with its token, the agency's co-worker roles beside them and each key's branches and clock alone", async () => {
    const got = await asked(read, {});

    expect(got.status).toBe(200);
    expect(got.answer?.roles).toEqual(["role-a", "role-b"]);
    expect(got.answer?.keys).toEqual([{ key: "search:basic", branches: 0, minutes: 5 }]);
    expect(got.answer?.engines?.[0]?.name).toBe("engine-a");
    expect(research.asked.at(-1)?.headers?.authorization).toBe("Bearer research-token");
    expect(agency.asked.some((call) => call.path === "/research-settings")).toBe(false);
  });

  test("says the research unit does not answer where the console names no address for it", async () => {
    const address = process.env.RESEARCH_ADDRESS;

    delete process.env.RESEARCH_ADDRESS;

    try {
      expect(await asked(read, {})).toMatchObject({ status: 503, message: wording("research.error.unreachable") });
    } finally {
      process.env.RESEARCH_ADDRESS = address;
    }
  });

  test("says the research unit does not answer where nothing takes the call", async () => {
    const address = process.env.RESEARCH_ADDRESS;

    process.env.RESEARCH_ADDRESS = "http://127.0.0.1:1";

    try {
      expect(await asked(read, {})).toMatchObject({ status: 503, message: wording("research.error.unreachable") });
    } finally {
      process.env.RESEARCH_ADDRESS = address;
    }
  });
});

describe("changing one research setting", () => {
  test("sends the one setting it changes and nothing else", async () => {
    const got = await asked(change, { body: { strategy: "browser-first" } });

    expect(got.answer?.strategy).toBe("browser-first");
    expect(research.asked.at(-1)).toMatchObject({ method: "PUT", path: "/research-settings", body: { strategy: "browser-first" } });

    await asked(change, { body: { hostIntervalMs: null } });

    expect(research.asked.at(-1)?.body).toEqual({ hostIntervalMs: null });
  });

  test("sends a key's branches and clock without its page budgets, which the unit keeps", async () => {
    await asked(change, { body: { keys: [{ key: "search:basic", branches: 2, minutes: 10 }] } });

    expect(research.asked.at(-1)?.body).toEqual({ keys: [{ key: "search:basic", branches: 2, minutes: 10 }] });
  });

  test("says the unit's refusal in the pack's words", async () => {
    expect(await asked(change, { body: { strategy: "sideways" } })).toMatchObject({ status: 400, message: wording("research.error.refused"), data: { code: "bad-request" } });
  });

  test("refuses a body that names no one setting of its own shape without calling the unit", async () => {
    const before = research.asked.length;

    expect(await asked(change, { body: { strategy: "browser-first", branchRole: "role-a" } })).toMatchObject({ status: 400 });
    expect(research.asked.length).toBe(before);
  });
});
