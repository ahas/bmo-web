import { describe, expect, test } from "bun:test";

import { engineLook, gapOf, gapText, STRATEGY_LABELS, strategyLabel } from "../../../apps/web/app/domain/research";
import { wording } from "../../../apps/web/shared/wording";

// The words the searcher tab says the research settings in (docs/web.md, the searcher tab): the three fetch
// strategies, a gap or the web tools' own, and each engine state as a mark and a word.

describe("the research settings' words", () => {
  test("name each of the agency's three strategies, and one it does not know by its value", () => {
    expect(Object.keys(STRATEGY_LABELS)).toEqual(["direct-then-browser", "browser-first", "direct-only"]);
    expect(strategyLabel(wording, "browser-first")).toBe(wording("research.label.strategy_browser_first"));
    expect(strategyLabel(wording, "sideways")).toBe(wording("research.label.unknown_value", { value: "sideways" }));
  });

  test("say a gap in milliseconds with its separators, the web tools' own as the default, and read an emptied box as it", () => {
    expect(gapText(wording, 1500)).toBe(wording("research.label.gap_value", { n: "1,500" }));
    expect(gapText(wording, null)).toBe(wording("research.label.default"));
    expect(gapOf(" ")).toBeNull();
    expect(gapOf("250")).toBe(250);
  });

  test("stand each engine state in its own tone, and one it does not know as its value", () => {
    expect(engineLook(wording, "healthy")).toMatchObject({ tone: "text-success", label: wording("research.label.state_healthy") });
    expect(engineLook(wording, "degraded").tone).toBe("text-warning");
    expect(engineLook(wording, "suspended").tone).toBe("text-error");
    expect(engineLook(wording, "resting").label).toBe(wording("research.label.unknown_value", { value: "resting" }));
  });
});
