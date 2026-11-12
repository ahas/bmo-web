// A role's agents as the roles tab shows them (docs/web.md, 「Agent management screen」, the roles tab; the
// agency's docs/role-agents.md).

import { providerWord } from "~/domain/axes";

import type { ProviderView, RoleAgentView } from "#shared/axes";

/** How many of its role's preset an agent lays its own over: its prompt, its bundles and its skills. */
export function agentOverrides(agent: Pick<RoleAgentView, "prompt" | "bundles" | "skills">): number {
  return [agent.prompt, agent.bundles, agent.skills].filter((one) => one !== null).length;
}

/** An agent's road on one line: its provider's word, its model and its effort; none where it names no road. */
export function agentRoadText(providers: readonly ProviderView[] | null | undefined, agent: Pick<RoleAgentView, "provider" | "model" | "effort">): string | null {
  if (agent.provider === null) return null;

  return [providerWord(providers, agent.provider), agent.model, agent.effort].filter((part) => part !== null && part !== "").join(" · ");
}
