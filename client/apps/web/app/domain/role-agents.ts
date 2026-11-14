// A role's agents as the roles tab shows them (docs/web.md, 「Agent management screen」, the roles tab; the
// agency's docs/role-agents.md).

import type { RoleAgentView } from "#shared/axes";

/** How many of its role's preset an agent lays its own over: its prompt, its bundles and its skills. */
export function agentOverrides(agent: Pick<RoleAgentView, "prompt" | "bundles" | "skills">): number {
  return [agent.prompt, agent.bundles, agent.skills].filter((one) => one !== null).length;
}
