import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import type { ProviderModelsView, ProviderView } from "../../../apps/web/shared/axes";

// The list a road is chosen from (docs/web.md, 「What a row runs on now」 and the TODO panel's model chip): the entry
// standing first, then a group to each provider whose program carries the line, in the agency's order, each with the
// models its catalogue answers, the road in use marked and a chosen road no list holds kept as its own entry. The
// console's routes are stood in for by what `$fetch` answers here.

const provider = (name: string, lines: string[], reason: string | null = null): ProviderView => ({
  name, label: `${name}-word`, enabled: true, registered: false, lines, quota: null, reason, reasonEnglish: null, foldRatioDefault: null
});
const PROVIDERS = [provider("provider-a", ["worker", "chat"]), provider("provider-b", ["chat"]), provider("provider-c", [], "Signed out.")];
const MODELS: Record<string, ProviderModelsView> = {
  "provider-a": { provider: "provider-a", models: [{ id: "model-a", efforts: [], inService: true, thinking: null, answerTokens: null }, { id: "model-old", efforts: [], inService: false, thinking: null, answerTokens: null }], staleReadAt: null },
  "provider-c": { provider: "provider-c", models: [{ id: "vendor/model-c", efforts: [], inService: null, thinking: null, answerTokens: null }], staleReadAt: null }
};
const asked: string[] = [];

Object.assign(globalThis, {
  $fetch: async (url: string) => {
    asked.push(url);

    if (url === "/api/providers") return PROVIDERS;

    const name = decodeURIComponent(url.slice("/api/provider-models/".length));

    return MODELS[name];
  }
});

const { ROAD_ORDER, roadParts, roadValue, useRoadChoices } = await import("../../../apps/web/app/domain/road-choices");

describe("a road", () => {
  test("is a provider and a model, the model all after the first slash", () => {
    expect(roadValue("openrouter", "vendor/model-a")).toBe("openrouter/vendor/model-a");
    expect(roadParts("openrouter/vendor/model-a")).toEqual({ provider: "openrouter", model: "vendor/model-a" });
    expect(roadParts("auto")).toBeNull();
    expect(roadParts(ROAD_ORDER)).toBeNull();
    expect(roadParts("/model-a")).toBeNull();
    expect(roadParts("provider-a/")).toBeNull();
  });
});

describe("the list of roads", () => {
  test("reads only the providers carrying the line, and groups their models in the agency's order", async () => {
    const choices = useRoadChoices(wording, () => "worker");

    await choices.read();

    expect(asked).toEqual(["/api/providers", "/api/provider-models/provider-a", "/api/provider-models/provider-c"]);

    const first = { value: "auto", label: "auto" };
    const groups = choices.groups(first, "provider-a/model-a", "provider-c/vendor/model-c");

    expect(groups[0]).toEqual([first]);
    expect(groups[1]).toEqual([
      { type: "label", value: "@provider-a", label: "provider-a-word" },
      { value: "provider-a/model-a", label: "model-a" },
      { value: "provider-a/model-old", label: "model-old", description: wording("agents.label.model_superseded") }
    ]);
    // A provider that cannot answer now says why in its head; the road in use says so under it.
    expect(groups[2]).toEqual([
      { type: "label", value: "@provider-c", label: "provider-c-word · Signed out." },
      { value: "provider-c/vendor/model-c", label: "vendor/model-c", description: wording("agents.label.active_in_use") }
    ]);
    expect(groups).toHaveLength(3);
  });

  test("keeps a chosen road no list holds as its own entry", () => {
    const choices = useRoadChoices(wording, () => "worker");
    const first = { value: "auto", label: "auto" };

    expect(choices.groups(first, "provider-a/model-gone", null)[1]?.[1]).toEqual({ value: "provider-a/model-gone", label: "model-gone" });
    // A provider of another line the row names still stands, and one the agency does not list stands under its name.
    expect(choices.groups(first, "provider-b/model-b", null)[2]?.[0]).toEqual({ type: "label", value: "@provider-b", label: "provider-b-word" });
    expect(choices.groups(first, "provider-z/model-z", null).at(-1)).toEqual([{ type: "label", value: "@provider-z", label: "provider-z" }, { value: "provider-z/model-z", label: "model-z" }]);
  });
});
