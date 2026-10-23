import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { foldPercent, foldPercentFault, foldPercentText, foldRatioAt, foldRatioChange, foldSourceText } from "../../../apps/web/app/domain/fold-ratios";

import type { FoldRatiosView } from "../../../apps/web/shared/agency";

// What the fold-ratio grid on the tier tab says of each cell, and the body a typed percent is sent as
// (docs/web.md, 「Agent management screen」).

const GRID: FoldRatiosView = {
  tiers: ["Frontier", "Reliable", "Light"],
  providers: ["claude-code", "openrouter"],
  ratios: [
    { provider: "claude-code", tier: "Frontier", ratio: 0.85, source: "default" },
    { provider: "claude-code", tier: "Reliable", ratio: 0.7, source: "set" },
    { provider: "claude-code", tier: "Light", ratio: 0.85, source: "default" },
    { provider: "openrouter", tier: "Frontier", ratio: 0.5, source: "provider" },
    { provider: "openrouter", tier: "Reliable", ratio: 0.5, source: "provider" },
    { provider: "openrouter", tier: "Light", ratio: 0.855, source: "set" }
  ]
};

describe("a fold-ratio cell", () => {
  test("stands for every tier and every provider of the grid", () => {
    for (const tier of GRID.tiers) {
      for (const provider of GRID.providers) {
        expect(foldRatioAt(GRID, tier, provider)).toMatchObject({ provider, tier });
      }
    }
    expect(foldRatioAt(GRID, "Simple", "claude-code")).toBeNull();
    expect(foldRatioAt(null, "Frontier", "claude-code")).toBeNull();
  });

  test("shows its ratio as a percent, to one decimal place", () => {
    expect(foldPercent(0.85)).toBe(85);
    expect(foldPercent(0.855)).toBe(85.5);
    expect(foldPercentText(wording, 0.7)).toBe(wording("agents.label.fold_percent", { percent: "70" }));
  });

  test("says where its ratio comes from in the pack's words", () => {
    expect(foldSourceText(wording, foldRatioAt(GRID, "Reliable", "claude-code")!.source)).toBe(wording("agents.label.fold_source_set"));
    expect(foldSourceText(wording, foldRatioAt(GRID, "Frontier", "openrouter")!.source)).toBe(wording("agents.label.fold_source_provider"));
    expect(foldSourceText(wording, foldRatioAt(GRID, "Frontier", "claude-code")!.source)).toBe(wording("agents.label.fold_source_default"));
  });
});

describe("a typed percent", () => {
  test("is a whole number from 1 to 100, or it is refused before it is sent", () => {
    for (const text of ["1", "50", "100", " 85 "]) {
      expect(foldPercentFault(wording, text)).toBeNull();
    }
    for (const text of ["", "0", "101", "-5", "85.5", "abc"]) {
      expect(foldPercentFault(wording, text)).toBe(wording("agents.error.fold_percent", { min: 1, max: 100 }));
    }
  });

  test("is sent as that provider's ratio at that tier", () => {
    expect(foldRatioChange("openrouter", "Reliable", "60")).toEqual({ provider: "openrouter", tier: "Reliable", ratio: 0.6 });
    expect(foldRatioChange("claude-code", "Frontier", "100")).toEqual({ provider: "claude-code", tier: "Frontier", ratio: 1 });
  });
});
