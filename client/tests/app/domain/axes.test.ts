import { describe, expect, test } from "bun:test";

import { ceilingDefault, defaultThreshold, roadText, thinkingDefault, thresholdText } from "../../../apps/web/app/domain/axes";
import { headOffset } from "../../../apps/web/app/domain/held-heads";
import { wording } from "../../../apps/web/shared/wording";

import type { RoadView, ProviderModelsView, ProviderView } from "../../../apps/web/shared/axes";

// The defaults the agency's providers and models declare, marked where a value equals them (docs/web.md, 「The default
// among choices」).

const t = wording;

const provider = (name: string, foldRatioDefault: number | null): ProviderView => ({
  name, label: name, enabled: true, registered: false, lines: [], reason: null, reasonEnglish: null, foldRatioDefault, keyFile: null, ownersEngine: true
});
const entry = (name: string): RoadView => ({ provider: name, model: "model-a", effort: null, thinking: null, answerTokens: null });
const models: ProviderModelsView = {
  provider: "provider-a",
  models: [{ id: "model-a", efforts: [], inService: true, thinking: false, answerTokens: 8192 }, { id: "model-b", efforts: [], inService: null, thinking: null, answerTokens: null }],
  staleReadAt: null
};

describe("a compaction threshold", () => {
  test("is the row's default where it equals the declared one of its road's provider", () => {
    const providers = [provider("provider-a", 0.85), provider("provider-b", 0.6)];
    const fallback = defaultThreshold(providers, "provider-b");

    expect(fallback).toBe(0.6);
    expect(thresholdText(t, 0.6, fallback)).toBe(wording("agents.label.default_marked", { value: "60%" }));
    expect(thresholdText(t, 0.85, fallback)).toBe("85%");
  });

  test("is marked nowhere while its road's provider has not been read or declares none, or it names no road", () => {
    expect(defaultThreshold(undefined, "provider-a")).toBeNull();
    expect(defaultThreshold([provider("provider-a", null)], "provider-a")).toBeNull();
    expect(defaultThreshold([provider("provider-a", 0.85)], null)).toBeNull();
    expect(thresholdText(t, 0.85, null)).toBe("85%");
  });
});

describe("a model's declared run settings", () => {
  test("are its thinking default and answer ceiling, none where it declares none or is not listed", () => {
    expect(thinkingDefault(models, "model-a")).toBe(false);
    expect(ceilingDefault(models, "model-a")).toBe(8192);
    expect(thinkingDefault(models, "model-b")).toBeNull();
    expect(ceilingDefault(models, "model-c")).toBeNull();
    expect(thinkingDefault(null, "model-a")).toBeNull();
  });
});

describe("a held head of names", () => {
  test("stands as far down its table as the table's top has passed the box's top, never past its last row", () => {
    expect(headOffset(100, 150, 400, 40)).toBe(0);
    expect(headOffset(100, 60, 400, 40)).toBe(40);
    expect(headOffset(100, 59.6, 400, 40)).toBe(40);
    expect(headOffset(100, -500, 400, 40)).toBe(360);
  });
});

// A road on one line (docs/web.md, 「Agent management screen」): a supervisor's road cell and a role agent's alike.
describe("a road on one line", () => {
  test("is its provider's word, its model and its effort, and none where it names no provider", () => {
    const providers = [{ ...provider("provider-a", null), label: "Provider A" }];

    expect(roadText(providers, { ...entry("provider-a"), effort: "high" })).toBe("Provider A · model-a · high");
    expect(roadText(providers, entry("provider-a"))).toBe("Provider A · model-a");
    expect(roadText(providers, { provider: null, model: null, effort: null })).toBeNull();
  });
});
