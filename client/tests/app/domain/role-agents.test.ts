import { describe, expect, test } from "bun:test";

import { agentOverrides } from "../../../apps/web/app/domain/role-agents";

import type { RoleAgentView } from "../../../apps/web/shared/axes";

// A role's agents as the roles tab shows them (docs/web.md, 「Agent management screen」, the roles tab).

function agent(name: string, over: Partial<RoleAgentView> = {}): RoleAgentView {
  return {
    name, role: "coder", provider: "deepseek", model: "deepseek-v4-pro", effort: "high", thinking: null, answerTokens: null, enabled: true,
    keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false, ...over
  };
}

describe("what an agent lays over its role", () => {
  test("is counted a part at a time", () => {
    expect(agentOverrides(agent("coder-01"))).toBe(0);
    expect(agentOverrides(agent("coder-01", { prompt: "x", skills: ["a"] }))).toBe(2);
    expect(agentOverrides(agent("coder-01", { bundles: [] }))).toBe(1);
  });
});
