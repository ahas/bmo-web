import { afterAll, describe, expect, test } from "bun:test";

import "../../support/nitro";

// The research settings as the console reads and changes them (docs/web.md, the searcher tab): the agency's
// `GET /research-settings` with the co-worker roles beside it, and one setting changed through `PUT`, the three
// fields the agency always reads sent as null where unchanged and a gap named only where it is changed.

const heard: { method: string; path: string; body: unknown }[] = [];
const SETTINGS = {
  branchRole: "role-a", strategy: "direct-then-browser", hostIntervalMs: null, engineIntervalMs: 250,
  keys: [{ key: "search:basic", branches: 0, minutes: 5, pages: 3, branchPages: null }], source: "default",
  engines: [{ name: "engine-a", category: "general", state: "healthy", reason: null, observedAt: 1_000, suspendedUntil: null }], enginesUnread: null
};

const agency = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const text = await request.text();

    heard.push({ method: request.method, path: url.pathname, body: text === "" ? null : JSON.parse(text) });

    if (url.pathname === "/roles") return Response.json({ items: [{ name: "role-a" }, { name: "role-b" }], more: false });
    if (url.pathname === "/research-settings" && request.method === "PUT") {
      const body = JSON.parse(text) as Record<string, unknown>;

      if (body.strategy === "sideways") return Response.json({ code: "bad-request", error: "a strategy outside the three" }, { status: 400 });

      return Response.json({ ...SETTINGS, ...Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null)), source: "set" });
    }
    if (url.pathname === "/research-settings") return Response.json(SETTINGS);

    return Response.json({ code: "not-found" }, { status: 404 });
  }
});

process.env.AGENCY_ADDRESS = `http://127.0.0.1:${agency.port}`;
process.env.AGENCY_TOKEN = "agency-token";

afterAll(async () => {
  await agency.stop(true);
});

const { changeResearchSettings, readResearchSettings, researchChangeOf } = await import("../../../apps/web/server/utils/research-settings");

describe("the research settings", () => {
  test("are read with the co-worker roles beside them, each key's branches and clock alone", async () => {
    const view = await readResearchSettings();

    expect(view.roles).toEqual(["role-a", "role-b"]);
    expect(view.keys).toEqual([{ key: "search:basic", branches: 0, minutes: 5 }]);
    expect(view.engines?.[0]?.name).toBe("engine-a");
  });

  test("change one setting, the fields the agency always reads sent as null and an unchanged gap not sent", async () => {
    await changeResearchSettings({ strategy: "browser-first" });

    expect(heard.findLast((one) => one.method === "PUT")?.body).toEqual({ branchRole: null, strategy: "browser-first", keys: null });

    await changeResearchSettings({ hostIntervalMs: null });

    expect(heard.findLast((one) => one.method === "PUT")?.body).toEqual({ branchRole: null, strategy: null, keys: null, hostIntervalMs: null });
  });

  test("meet the agency's refusal as a refusal", async () => {
    await expect(changeResearchSettings({ strategy: "sideways" })).rejects.toBeDefined();
  });

  test("take one change of its own shape from a body, and nothing else", () => {
    expect(researchChangeOf({ branchRole: "role-b" })).toEqual({ branchRole: "role-b" });
    expect(researchChangeOf({ engineIntervalMs: null })).toEqual({ engineIntervalMs: null });
    expect(researchChangeOf({ keys: [{ key: "search:basic", branches: 2, minutes: 10 }] })).toEqual({ keys: [{ key: "search:basic", branches: 2, minutes: 10 }] });
    expect(researchChangeOf({ strategy: "browser-first", branchRole: "role-a" })).toBeNull();
    expect(researchChangeOf({ hostIntervalMs: 1.5 })).toBeNull();
    expect(researchChangeOf({ keys: [{ key: "search:basic", branches: "two", minutes: 10 }] })).toBeNull();
    expect(researchChangeOf(null)).toBeNull();
  });
});
