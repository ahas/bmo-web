import { describe, expect, test } from "bun:test";

import { ceilingDefault, defaultThreshold, thinkingDefault, thresholdText } from "../../../apps/web/app/domain/axes";
import { tileLines } from "../../../apps/web/app/domain/role-slots";
import { wording } from "../../../apps/web/shared/wording";

import type { OrderEntryView, ProviderModelsView, ProviderView } from "../../../apps/web/shared/axes";

// The defaults the agency's providers and models declare, marked where a value equals them (docs/web.md, 「The default
// among choices」), and what a slot tile says of the run it holds (docs/web.md, 「Live status screen」).

const t = wording;

const provider = (name: string, foldRatioDefault: number | null): ProviderView => ({
  name, label: name, enabled: true, registered: false, lines: [], quota: null, reason: null, reasonEnglish: null, foldRatioDefault
});
const entry = (name: string): OrderEntryView => ({ provider: name, model: "model-a", effort: null, thinking: null, answerTokens: null });
const models: ProviderModelsView = {
  provider: "provider-a",
  models: [{ id: "model-a", efforts: [], inService: true, thinking: false, answerTokens: 8192 }, { id: "model-b", efforts: [], inService: null, thinking: null, answerTokens: null }],
  staleReadAt: null
};

describe("a compaction threshold", () => {
  test("is the row's default where it equals the declared one of the first provider of its order", () => {
    const providers = [provider("provider-a", 0.85), provider("provider-b", 0.6)];
    const fallback = defaultThreshold(providers, [entry("provider-b"), entry("provider-a")]);

    expect(fallback).toBe(0.6);
    expect(thresholdText(t, 0.6, fallback)).toBe(wording("agents.label.default_marked", { value: "60%" }));
    expect(thresholdText(t, 0.85, fallback)).toBe("85%");
  });

  test("is marked nowhere while the first provider has not been read or declares none", () => {
    expect(defaultThreshold(undefined, [entry("provider-a")])).toBeNull();
    expect(defaultThreshold([provider("provider-a", null)], [entry("provider-a")])).toBeNull();
    expect(defaultThreshold([provider("provider-a", 0.85)], [])).toBeNull();
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

describe("a slot tile's lines", () => {
  test("name the work its run was asked for after its state", () => {
    const lines = tileLines(t, { state: "working", run: { place: "repo-a", path: "/srv/repo-a", source: "job", provider: null, model: null, since: null, title: "Title A", log: "run-a", stop: null } }, 0);

    expect(lines).toEqual([`${wording("live.label.slot_working")} · job`, "Title A", "/srv/repo-a"]);
  });
});
