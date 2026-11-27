import { describe, expect, test } from "bun:test";

import { roadLine } from "../../../apps/web/app/domain/own-agents";
import { isOwnRoad } from "../../../apps/web/shared/own-agents";

// A road as one line a person reads, and a road as the screen sends one (docs/web.md, 「Settings」, the own-agents
// section).
describe("an agent's road", () => {
  const providers = [{ name: "claude-code", label: "Claude Code", lines: ["worker"], off: null, offBy: null }];

  test("reads as its provider's label, its model and its effort, or as the words for none", () => {
    expect(roadLine({ provider: "claude-code", model: "model-a", effort: "high" }, providers, "none")).toBe("Claude Code · model-a · high");
    expect(roadLine({ provider: "other", model: "model-b", effort: null }, providers, "none")).toBe("other · model-b");
    expect(roadLine(null, providers, "none")).toBe("none");
  });

  test("is a provider with a model, its effort a level or none", () => {
    expect(isOwnRoad({ provider: "claude-code", model: "model-a", effort: null })).toBe(true);
    expect(isOwnRoad({ provider: "claude-code", model: "model-a" })).toBe(true);
    expect(isOwnRoad({ provider: "claude-code", model: "" })).toBe(false);
    expect(isOwnRoad({ provider: "", model: "model-a" })).toBe(false);
    expect(isOwnRoad({ provider: "claude-code", model: "model-a", effort: 3 })).toBe(false);
    expect(isOwnRoad(null)).toBe(false);
  });
});
