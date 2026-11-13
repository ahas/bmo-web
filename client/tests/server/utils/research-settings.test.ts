import { describe, expect, test } from "bun:test";

import "../../support/nitro";

// A change to the research settings as the console reads it off a body (docs/web.md, 「Research screen」, its settings tab): one field,
// of its own shape. The calls on the research unit are the routes' (server/api/research-settings.test.ts).

const { researchChangeOf } = await import("../../../apps/web/server/utils/research-settings");

describe("a research change", () => {
  test("is one field of its own shape read off a body, and nothing else", () => {
    expect(researchChangeOf({ branchRole: "role-b" })).toEqual({ branchRole: "role-b" });
    expect(researchChangeOf({ engineIntervalMs: null })).toEqual({ engineIntervalMs: null });
    expect(researchChangeOf({ keys: [{ key: "search:basic", branches: 2, minutes: 10 }] })).toEqual({ keys: [{ key: "search:basic", branches: 2, minutes: 10 }] });
    expect(researchChangeOf({ strategy: "browser-first", branchRole: "role-a" })).toBeNull();
    expect(researchChangeOf({ hostIntervalMs: 1.5 })).toBeNull();
    expect(researchChangeOf({ keys: [{ key: "search:basic", branches: "two", minutes: 10 }] })).toBeNull();
    expect(researchChangeOf(null)).toBeNull();
  });
});
