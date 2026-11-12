import { describe, expect, test } from "bun:test";

import { agentOverrides, agentRoadText } from "../../../apps/web/app/domain/role-agents";

import type { ProviderView, RoleAgentView } from "../../../apps/web/shared/axes";

// A role's agents as the roles tab shows them (docs/web.md, 「Agent management screen」, the roles tab).

function agent(name: string, over: Partial<RoleAgentView> = {}): RoleAgentView {
  return {
    name, role: "coder", provider: "deepseek", model: "deepseek-v4-pro", effort: "high", thinking: null, answerTokens: null, enabled: true,
    keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false, ...over
  };
}

const PROVIDERS = [{ name: "deepseek", label: "DeepSeek" }] as ProviderView[];

describe("an agent's road", () => {
  test("is its provider's word, its model and its effort on one line, and none where it names no road", () => {
    expect(agentRoadText(PROVIDERS, agent("coder-01"))).toBe("DeepSeek · deepseek-v4-pro · high");
    expect(agentRoadText(PROVIDERS, agent("coder-01", { effort: null }))).toBe("DeepSeek · deepseek-v4-pro");
    expect(agentRoadText(PROVIDERS, agent("coder-01", { provider: null, model: null, effort: null }))).toBeNull();
  });
});

describe("what an agent lays over its role", () => {
  test("is counted a part at a time", () => {
    expect(agentOverrides(agent("coder-01"))).toBe(0);
    expect(agentOverrides(agent("coder-01", { prompt: "x", skills: ["a"] }))).toBe(2);
    expect(agentOverrides(agent("coder-01", { bundles: [] }))).toBe(1);
  });
});
