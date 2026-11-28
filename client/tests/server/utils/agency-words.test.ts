import { describe, expect, test } from "bun:test";

import english from "../../../apps/web/i18n/locales/en.yaml";
import japanese from "../../../apps/web/i18n/locales/ja.yaml";
import korean from "../../../apps/web/i18n/locales/ko.yaml";
import chinese from "../../../apps/web/i18n/locales/zh-CN.yaml";
import { BUNDLE_LABELS, bundleWordOf, providerLabelOf, roadReasonOf } from "../../../apps/web/server/utils/agency-words";
import { packEntries, wording } from "../../../apps/web/shared/wording";

import AGENCY_BUNDLES from "../../fixtures/server/agency-bundles.json";

import type { Pack } from "../../../apps/web/shared/wording";

const PACKS: [string, Pack][] = [
  ["ko", korean as Pack],
  ["en", english as Pack],
  ["ja", japanese as Pack],
  ["zh-CN", chinese as Pack]
];

// The agency's codes said in the pack's words (docs/web.md, the agents page's general tab): a road's reason with
// the agency's sentence kept beside it, a bundle by its code, and a code the pack does not hold said by the pack's
// generic word for its sort. A
// role is worded by none of them: every screen shows it by its name alone.

test("a road's reason is said by its code, the agency's sentence kept for the tooltip", () => {
  const english = "OpenRouter cannot be chosen: BMO_OPENROUTER_KEY is not set.";

  expect(roadReasonOf(english, "openrouter-key-unset")).toEqual({ reason: wording("agents.status.road_openrouter_key_unset"), reasonEnglish: english });
  expect(roadReasonOf("Something new.", "brand-new")).toEqual({ reason: wording("agents.status.road_unknown_code", { code: "brand-new" }), reasonEnglish: "Something new." });
  expect(roadReasonOf("The resolution's own.", null)).toEqual({ reason: wording("agents.status.road_unavailable"), reasonEnglish: "The resolution's own." });
  expect(roadReasonOf(null, null)).toEqual({ reason: null, reasonEnglish: null });
});

test("a bundle is named by its code", () => {
  expect(bundleWordOf("web-read", "web.read")).toBe(wording("agents.label.bundle_web_read"));
  expect(bundleWordOf(undefined, "room-send")).toBe(wording("agents.label.bundle_room_send"));
  expect(bundleWordOf("queue-read", "queue.read")).toBe(wording("agents.label.bundle_queue_read"));
});

test("a bundle the pack holds no words for is named as another bundle, never by the agency's label", () => {
  expect(bundleWordOf(undefined, "bundle.a")).toBe(wording("agents.label.bundle_other"));
  expect(bundleWordOf("toString", "bundle.a")).toBe(wording("agents.label.bundle_other"));
});

// The agency's files are never read here, so the bundles its policy declares (`policy/roles.toml`, `[[bundles]]`, each
// code its name with each dot a hyphen) stand captured in a fixture.
describe("every bundle the agency declares", () => {
  test("has the pack's key for its word", () => {
    expect(AGENCY_BUNDLES.codes.filter((code) => !Object.hasOwn(BUNDLE_LABELS, code))).toEqual([]);
  });

  test.each(PACKS)("is held in its own words in the %s pack", (_language, pack) => {
    const held = new Map(packEntries(pack));
    const unheld = AGENCY_BUNDLES.codes.filter((code) => (held.get(BUNDLE_LABELS[code] ?? "") ?? "").trim() === "");

    expect(unheld).toEqual([]);
    expect((held.get("agents.label.bundle_other") ?? "").trim()).not.toBe("");
  });
});

test("a provider is named by its code, a product by its own name and the registry in the pack's word", () => {
  expect(providerLabelOf("claude-code", "claude-code")).toBe(wording("agents.label.provider_claude_code"));
  expect(providerLabelOf("registered", "registered")).toBe(wording("agents.label.provider_registered"));
  expect(providerLabelOf(undefined, "deepseek")).toBe(wording("agents.label.provider_deepseek"));
  expect(providerLabelOf("anthropic", "anthropic")).toBe(wording("agents.label.provider_anthropic"));
  expect(providerLabelOf("brand-new", "brand-new")).toBe(wording("agents.label.unknown_code", { code: "brand-new" }));
});
