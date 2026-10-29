import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { AGENT_TABS, isAgentTab, mappingText, routeModeChoices, searchSettings, settingsAnchor } from "../../../apps/web/app/domain/agent-settings";

import type { OfferedProvider } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/agent-settings.test.ko.json";

describe("the sections of the agent management screen", () => {
  test("are the general settings first, then each section on its own tab", () => {
    expect(AGENT_TABS.map((tab) => wording(tab.label))).toEqual([KO.line_11, KO.line_11_5, KO.line_11_2, KO.line_11_3, wording("agents.label.tab_routes"), KO.line_11_6]);
    expect(isAgentTab("gates")).toBe(false);
    expect(isAgentTab("supervisors")).toBe(true);
    expect(isAgentTab("companions")).toBe(false);
    // The co-worker limits stand in the Models tab, so there is no tab of their own.
    expect(isAgentTab("pool")).toBe(false);
    expect(isAgentTab("fallback")).toBe(false);
  });
});

describe("a key's provider chooser", () => {
  const offered: OfferedProvider[] = [
    { name: "claude-code", label: "Claude Code", reason: null, reasonEnglish: null },
    { name: "codex", label: "Codex", reason: KO.line_23, reasonEnglish: null },
    { name: "openrouter", label: "OpenRouter", reason: null, reasonEnglish: null },
    { name: "registered", label: KO.line_25, reason: null, reasonEnglish: null }
  ];

  test("offers auto and every provider by its own name, a refused one disabled, and no local model first", () => {
    expect(routeModeChoices(wording, offered)).toEqual([
      { value: "auto", label: KO.line_30, disabled: false },
      { value: "claude-code", label: "Claude Code", disabled: false },
      { value: "codex", label: "Codex", disabled: true, description: KO.line_32 },
      { value: "openrouter", label: "OpenRouter", disabled: false },
      { value: "registered", label: KO.line_34, disabled: false }
    ]);
    expect(routeModeChoices(wording, offered).some((one) => one.label.includes(KO.line_36))).toBe(false);
  });
});

describe("a tier mapping in a table cell", () => {
  test("reads the effort, or the token size and thinking where the provider's mapping carries an answer ceiling", () => {
    expect(mappingText(wording, { provider: "codex", model: "gpt-5.6-sol", effort: "max" }, false)).toEqual({ model: "gpt-5.6-sol", detail: "max" });
    expect(mappingText(wording, { provider: "registered", model: "qwen3.8-27b", effort: null, answerTokens: null }, true)).toEqual({ model: "qwen3.8-27b", detail: wording("agents.label.thinking_off", { tokens: KO.line_43 }) });
    expect(mappingText(wording, { provider: "registered", model: "qwen3.8-27b", effort: "thinking", answerTokens: 8192 }, true)).toEqual({ model: "qwen3.8-27b", detail: wording("agents.label.thinking_on", { tokens: "8,192" }) });
    expect(mappingText(wording, null, false)).toBeNull();
  });
});

describe("the settings search", () => {
  const entries = [
    { id: "tier-Frontier", tab: "tiers" as const, label: "Frontier", fields: [{ label: KO.line_51, text: "Frontier", shown: true }, { label: "Codex", text: "gpt-5.6-sol max", shown: true }] },
    { id: "route-sanitizer", tab: "routes" as const, label: KO.line_52, fields: [{ label: KO.line_52_2, text: KO.line_52, shown: true }, { label: KO.line_52_3, text: "sanitizer", shown: false }] }
  ];

  test("finds a row by what it shows and by what it only holds, and names the tab", () => {
    expect(searchSettings(wording, entries, "frontier").map((hit) => hit.entry.id)).toEqual(["tier-Frontier"]);
    expect(searchSettings(wording, entries, "sanitizer")[0]?.match).toEqual({ shown: false, hidden: { label: KO.line_57, snippet: "sanitizer" } });
    expect(searchSettings(wording, entries, wording("agents.label.tab_routes")).map((hit) => hit.entry.id)).toEqual(["route-sanitizer"]);
    expect(searchSettings(wording, entries, "")).toEqual([]);
  });

  test("anchors a row by an id a page can carry", () => {
    expect(settingsAnchor("route-role:builder")).toBe("setting-route-role-builder");
  });
});
