import { describe, expect, test } from "bun:test";

import { activeRoad, activeRoadText, ceilingDefault, defaultThreshold, thinkingDefault, thresholdText } from "../../../apps/web/app/domain/axes";
import { headOffset } from "../../../apps/web/app/domain/held-heads";
import { slotLogPlace, tileLines } from "../../../apps/web/app/domain/role-slots";
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
    const lines = tileLines(t, { state: "working", run: { place: "repo-a", path: "/srv/repo-a", source: "job", provider: null, model: null, since: null, title: "Title A", log: "run-a", session: null, stop: null } }, 0);

    expect(lines).toEqual([`${wording("live.label.slot_working")} · job`, "Title A", "/srv/repo-a"]);
  });
});

describe("where a slot tile opens its log", () => {
  test("is the run it names, else the newest lines of a role session's, else the moment it took the slot", () => {
    expect(slotLogPlace({ log: "run-a", session: "session-a", since: 5_000 })).toEqual({ run: "run-a" });
    expect(slotLogPlace({ log: null, session: "session-a", since: 5_000 })).toBeNull();
    expect(slotLogPlace({ log: null, session: null, since: 5_000 })).toEqual({ at: 5 });
    expect(slotLogPlace({ log: null, session: null, since: null })).toBeNull();
    expect(slotLogPlace(null)).toBeNull();
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

// What a row runs on now and how that provider became active (docs/web.md, 「What a row runs on now」).
describe("a row's active road", () => {
  const order = [{ ...entry("provider-a"), effort: "high" }, { ...entry("provider-b"), model: "model-b", effort: "low" }];

  test("is the forced provider on its forced model, at the effort the order's entry for it names", () => {
    const road = activeRoad({ active: { provider: "provider-b", model: "model-c" }, order, provider: "provider-b" }, { model: "model-a", effort: "high" });

    expect(road).toEqual({ provider: "provider-b", model: "model-c", effort: "low", forced: true });
    expect(activeRoadText([provider("provider-b", null)], road!)).toBe("provider-b · model-c · low");
    // A forced provider the order does not hold runs at the provider's own effort.
    expect(activeRoad({ active: { provider: "provider-c", model: "model-d" }, order, provider: "provider-c" }, null)).toEqual({ provider: "provider-c", model: "model-d", effort: null, forced: true });
  });

  test("is a supervisor's last turn where the order chose, and a role's order's entry for its active provider", () => {
    expect(activeRoad({ active: null, order, provider: "provider-a" }, { model: "model-x", effort: "max" })).toEqual({ provider: "provider-a", model: "model-x", effort: "max", forced: false });
    expect(activeRoad({ active: null, order, provider: "provider-b" }, null)).toEqual({ provider: "provider-b", model: "model-b", effort: "low", forced: false });
  });

  test("is none where the agency names no active provider", () => {
    expect(activeRoad({ active: null, order, provider: null }, null)).toBeNull();
  });
});
