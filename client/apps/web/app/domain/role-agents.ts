// A role's agents as the roles tab shows and moves them (docs/web.md, 「Agent management screen」, the roles tab; the
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

export interface MovedPlaces {
  // The agents in their new order, each on the place it now holds.
  agents: RoleAgentView[];
  // The agents whose place changed, with the place each is sent.
  sent: { name: string; position: number }[];
}

/** One agent moved from one place of its role's list to another: the list in its new order with places counted from
 * one, and only the agents whose place differs from the one they held; none where nothing moves. */
export function movedPlaces(agents: readonly RoleAgentView[], from: number, to: number): MovedPlaces | null {
  if (from === to || from < 0 || to < 0 || from >= agents.length || to >= agents.length) return null;

  const order = [...agents];
  const [taken] = order.splice(from, 1);

  order.splice(to, 0, taken!);

  const placed = order.map((agent, index) => ({ ...agent, position: index + 1 }));
  const sent = placed.filter((agent) => agents.find((one) => one.name === agent.name)!.position !== agent.position).map((agent) => ({ name: agent.name, position: agent.position }));

  return { agents: placed, sent };
}
