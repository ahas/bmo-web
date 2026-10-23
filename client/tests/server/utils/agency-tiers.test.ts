import { expect, test } from "bun:test";

import { tierSettingsOf } from "../../../apps/web/server/utils/agency";

// The tier screen's reading of the agency's tiers (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers
// and fallback」): each tier's mapping on each provider, by the provider's name, with its model, effort and answer
// ceiling; a cell that names no model is no mapping.

test("reads each tier's mapping on every provider, and leaves out a cell naming no model", () => {
  const settings = tierSettingsOf(
    [
      { name: "tier-a", coworker: false, mapping: { "provider-a": { model: "model-a", thinking: null, effort: "high", answerTokens: null }, "provider-b": { model: "", effort: null } } },
      { name: "tier-b", coworker: true, mapping: { "provider-a": { model: "model-b", thinking: null, effort: null, answerTokens: 4096 } } },
      { name: "tier-c", coworker: false, mapping: null }
    ],
    [{ name: "provider-a", enabled: true, registered: false, coworker: true, lines: [] }] as never
  );

  expect(settings.tiers).toEqual(["tier-a", "tier-b", "tier-c"]);
  expect(settings.mappings).toEqual([
    { provider: "provider-a" as never, tier: "tier-a", model: "model-a", effort: "high", answerTokens: null },
    { provider: "provider-a" as never, tier: "tier-b", model: "model-b", effort: null, answerTokens: 4096 }
  ]);
  expect(settings.assignments).toEqual([]);
});
