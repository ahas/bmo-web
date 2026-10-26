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

// Every work key's tier comes from the agency's `GET /work-keys`: what it resolves to on each provider, why it does
// not in the pack's words with the agency's sentence beside it, and the conflicts it carries.
test("reads each work key's tier, its resolution with the error worded by its code, and its conflicts", async () => {
  const { wording } = await import("../../../apps/web/shared/wording");
  const settings = tierSettingsOf([], [{ name: "registered", code: "registered", enabled: true, registered: true, coworker: false, lines: [] }] as never, [
    {
      key: "key-a",
      tier: "tier-a",
      choices: ["tier-a", "tier-b"],
      conflicts: [{ provider: "provider-a", previous: { model: "model-old", effort: null }, accepted: false }],
      effective: [
        { provider: "provider-a", selection: { provider: "provider-a", tier: "tier-a", model: "model-a", effort: null }, error: null, errorCode: null },
        { provider: "provider-b", selection: null, error: "Provider B cannot be chosen.", errorCode: "codex-missing" },
        { provider: "provider-c", selection: null, error: "The resolution's own.", errorCode: null }
      ]
    },
    { tier: "no-key" }
  ]);

  expect(settings.providers[0]?.label).toBe(wording("agents.label.provider_registered"));
  expect(settings.assignments).toHaveLength(1);
  expect(settings.assignments[0]?.choices).toEqual(["tier-a", "tier-b"]);
  expect(settings.assignments[0]?.effective.map((one) => [one.error, one.errorEnglish])).toEqual([
    [null, null],
    [wording("agents.status.road_codex_missing"), "Provider B cannot be chosen."],
    [wording("agents.status.road_unavailable"), "The resolution's own."]
  ]);
  expect(settings.conflicts).toEqual([{ key: "key-a", provider: "provider-a" as never, previous: { model: "model-old", effort: null }, accepted: false }]);
});
