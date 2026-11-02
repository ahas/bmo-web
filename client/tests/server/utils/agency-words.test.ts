import { expect, test } from "bun:test";

import { bundleLabelOf, bundleWordOf, providerLabelOf, roadReasonOf, roleLabelOf, roleWordOf } from "../../../apps/web/server/utils/agency-words";
import { wording } from "../../../apps/web/shared/wording";

// The agency's codes said in the pack's words (docs/web.md, the agents page's general tab): a road's reason with
// the agency's sentence kept beside it, a role and a bundle by their codes, and a code the pack does not hold said
// as the code.

test("a road's reason is said by its code, the agency's sentence kept for the tooltip", () => {
  const english = "OpenRouter cannot be chosen: BMO_OPENROUTER_KEY is not set.";

  expect(roadReasonOf(english, "openrouter-key-unset")).toEqual({ reason: wording("agents.status.road_openrouter_key_unset"), reasonEnglish: english });
  expect(roadReasonOf("Something new.", "brand-new")).toEqual({ reason: wording("agents.status.road_unknown_code", { code: "brand-new" }), reasonEnglish: "Something new." });
  expect(roadReasonOf("The resolution's own.", null)).toEqual({ reason: wording("agents.status.road_unavailable"), reasonEnglish: "The resolution's own." });
  expect(roadReasonOf(null, null)).toEqual({ reason: null, reasonEnglish: null });
});

test("a role and a bundle are named by their codes", () => {
  expect(roleLabelOf("searcher", "searcher")).toBe(wording("agents.label.role_searcher"));
  expect(bundleLabelOf("web-read", "web.read")).toBe(wording("agents.label.bundle_web_read"));
  expect(bundleLabelOf(undefined, "room-send")).toBe(wording("agents.label.bundle_room_send"));
  expect(roleLabelOf("pilot", "pilot")).toBe(wording("agents.label.unknown_code", { code: "pilot" }));
});

test("a role and a bundle the pack holds no words for are named by the agency's label, or by the name where it gives none", () => {
  expect(roleWordOf(undefined, "worker", "Worker")).toBe(wording("agents.label.role_worker"));
  expect(roleWordOf(undefined, "role-a", "Role A")).toBe("Role A");
  expect(roleWordOf(undefined, "role-a", "")).toBe("role-a");
  expect(bundleWordOf("queue-read", "queue.read", "Queue read")).toBe(wording("agents.label.bundle_queue_read"));
  expect(bundleWordOf(undefined, "bundle.a", "Bundle A")).toBe("Bundle A");
});

test("a provider is named by its code, a product by its own name and the registry in the pack's word", () => {
  expect(providerLabelOf("claude-code", "claude-code")).toBe(wording("agents.label.provider_claude_code"));
  expect(providerLabelOf("registered", "registered")).toBe(wording("agents.label.provider_registered"));
  expect(providerLabelOf(undefined, "deepseek")).toBe(wording("agents.label.provider_deepseek"));
  expect(providerLabelOf("brand-new", "brand-new")).toBe(wording("agents.label.unknown_code", { code: "brand-new" }));
});

test("every role the agency's policy seeds is worded by the pack, never by its English label", () => {
  const seeded = ["worker", "delegator", "helper", "video", "builder", "verifier", "digest", "scout", "screener", "searcher", "browser", "translator", "transliterator", "upkeep"];

  for (const code of seeded) {
    expect(roleWordOf(code, code, "English label")).not.toBe("English label");
    expect(roleLabelOf(code, code)).not.toBe(wording("agents.label.unknown_code", { code }));
  }
});
