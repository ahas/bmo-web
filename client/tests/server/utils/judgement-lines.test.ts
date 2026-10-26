import { describe, expect, test } from "bun:test";

import "../../support/nitro";

const { linesOf } = await import("../../../apps/web/server/utils/gate");

// The lines a picker's model read of its candidates, as the gate hands them with a judgement (the gate's `docs/api.md`,
// 「Judgements」): each line kept character for character with its answer, null where it was not read.
describe("a judgement's lines", () => {
  test("stand as the gate wrote them, in its order, an unread answer as none", () => {
    expect(linesOf([{ line: "- doc/a: the first", answer: "yes" }, { line: "- doc/b:  two  spaces", answer: null }])).toEqual([
      { line: "- doc/a: the first", answer: "yes" },
      { line: "- doc/b:  two  spaces", answer: null }
    ]);
  });

  test("a line that does not read is left out, and none are none", () => {
    expect(linesOf([{ answer: "yes" }, { line: 3, answer: "no" }])).toEqual([]);
    expect(linesOf(undefined)).toEqual([]);
  });
});
