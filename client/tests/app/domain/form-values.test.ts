import { describe, expect, test } from "bun:test";

import { sameValue } from "../../../apps/web/app/domain/form-values";

// A field of a form read against what is saved, as the console's forms read a change (docs/web.md, 「Forms」).

describe("a form's field against what is saved", () => {
  test("reads text trimmed and every kind of nothing alike", () => {
    expect(sameValue(" tester ", "tester")).toBe(true);
    expect(sameValue("", null)).toBe(true);
    expect(sameValue("  ", undefined)).toBe(true);
    expect(sameValue([], null)).toBe(true);
    expect(sameValue(Number.NaN, "")).toBe(true);
    expect(sameValue("tester", "tester-b")).toBe(false);
  });

  test("reads a number as the text an input writes for it", () => {
    expect(sameValue(4096, "4096")).toBe(true);
    expect(sameValue(0, "")).toBe(false);
  });

  test("reads a record without its empty keys and in any order, and a list item by item in its order", () => {
    expect(sameValue({ provider: "a", model: "b", effort: null }, { model: "b", provider: "a", effort: "" })).toBe(true);
    expect(sameValue({ a: true }, { a: false })).toBe(false);
    expect(sameValue(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameValue(["a", "b"], ["b", "a"])).toBe(false);
  });
});
