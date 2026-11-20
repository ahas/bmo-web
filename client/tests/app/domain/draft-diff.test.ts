import { describe, expect, test } from "bun:test";

import { draftDiff } from "../../../apps/web/app/domain/drafting";

// A message rewritten by a draft round, read as its change (docs/web.md, the room screen's draft chip): a line the
// rewrite kept stands plain, one it dropped stands removed, and one it brought stands added.

describe("a message's change", () => {
  test("marks the line a repair dropped and the one it brought, and keeps the rest plain", () => {
    expect(draftDiff("the logs are checked at dawn\nnothing else", "the logs are checked at dusk\nnothing else")).toEqual([
      { kind: "removed", text: "the logs are checked at dawn" },
      { kind: "added", text: "the logs are checked at dusk" },
      { kind: "same", text: "nothing else" }
    ]);
  });

  test("says nothing changed where the two are the same", () => {
    expect(draftDiff("one\n two", "one\n two").every((line) => line.kind === "same")).toBe(true);
  });

  test("reads an added line alone where nothing stood before", () => {
    expect(draftDiff("", "the first words")).toEqual([
      { kind: "removed", text: "" },
      { kind: "added", text: "the first words" }
    ]);
  });
});
