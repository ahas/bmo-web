import { describe, expect, test } from "bun:test";

import { valueText } from "../../../apps/web/app/domain/value-text";

// A value written for a reader (docs/web.md, 「A value shown as what it is」): never as JSON.
describe("a value as text", () => {
  test("an object stands as its named fields, a nested one a step in under its name", () => {
    expect(valueText({ path: "a.ts", range: { from: 1, to: 3 } })).toBe("path: a.ts\nrange:\n  from: 1\n  to: 3");
  });

  test("a list stands as its members under a dash, an object member a step in", () => {
    expect(valueText(["a", { b: 1 }])).toBe("- a\n-\n  b: 1");
  });

  test("a string, a number and a yes-or-no stand as they are, and nothing as nothing", () => {
    expect(valueText("x")).toBe("x");
    expect(valueText(3)).toBe("3");
    expect(valueText(true)).toBe("true");
    expect(valueText(null)).toBe("");
  });

  test("no output holds a brace or a bracket of JSON", () => {
    expect(valueText({ edits: [{ old: "a", new: "b" }], replace_all: false })).not.toMatch(/[{}[\]"]/);
  });
});
