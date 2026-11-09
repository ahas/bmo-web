import { describe, expect, test } from "bun:test";

import { agentOverrides, agentRoadText, movedPlaces } from "../../../apps/web/app/domain/role-agents";

import type { ProviderView, RoleAgentView } from "../../../apps/web/shared/axes";

// A role's agents as the roles tab shows and moves them (docs/web.md, 「Agent management screen」, the roles tab).

function agent(name: string, position: number, over: Partial<RoleAgentView> = {}): RoleAgentView {
  return {
    name, role: "coder", provider: "deepseek", model: "deepseek-v4-pro", effort: "high", thinking: null, answerTokens: null, enabled: true, position,
    keepsCache: false, foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false, ...over
  };
}

const PROVIDERS = [{ name: "deepseek", label: "DeepSeek" }] as ProviderView[];

describe("an agent's road", () => {
  test("is its provider's word, its model and its effort on one line, and none where it names no road", () => {
    expect(agentRoadText(PROVIDERS, agent("coder-01", 1))).toBe("DeepSeek · deepseek-v4-pro · high");
    expect(agentRoadText(PROVIDERS, agent("coder-01", 1, { effort: null }))).toBe("DeepSeek · deepseek-v4-pro");
    expect(agentRoadText(PROVIDERS, agent("coder-01", 1, { provider: null, model: null, effort: null }))).toBeNull();
  });
});

describe("what an agent lays over its role", () => {
  test("is counted a part at a time", () => {
    expect(agentOverrides(agent("coder-01", 1))).toBe(0);
    expect(agentOverrides(agent("coder-01", 1, { prompt: "x", skills: ["a"] }))).toBe(2);
    expect(agentOverrides(agent("coder-01", 1, { bundles: [] }))).toBe(1);
  });
});

describe("an agent moved among its role's", () => {
  const held = [agent("coder-01", 1), agent("coder-02", 2), agent("coder-03", 3)];

  test("trades places with its neighbour, and only the two are sent", () => {
    const moved = movedPlaces(held, 2, 1);

    expect(moved?.agents.map((one) => [one.name, one.position])).toEqual([["coder-01", 1], ["coder-03", 2], ["coder-02", 3]]);
    expect(moved?.sent).toEqual([{ name: "coder-03", position: 2 }, { name: "coder-02", position: 3 }]);
  });

  test("counts places from one whatever places the agents held", () => {
    const loose = [agent("coder-01", 4), agent("coder-02", 4), agent("coder-03", 9)];
    const moved = movedPlaces(loose, 0, 2);

    expect(moved?.agents.map((one) => [one.name, one.position])).toEqual([["coder-02", 1], ["coder-03", 2], ["coder-01", 3]]);
    expect(moved?.sent).toEqual([{ name: "coder-02", position: 1 }, { name: "coder-03", position: 2 }, { name: "coder-01", position: 3 }]);
  });

  test("moves nothing to its own place or out of the list", () => {
    expect(movedPlaces(held, 1, 1)).toBeNull();
    expect(movedPlaces(held, 0, -1)).toBeNull();
    expect(movedPlaces(held, 2, 3)).toBeNull();
  });
});
