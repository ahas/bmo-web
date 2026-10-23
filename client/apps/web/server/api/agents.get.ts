import type { AgentList } from "#shared/types";

// The catalogue of agents as the agency answers it: its agents and its workers, and the roles an agent may hold as
// the agents' answer carries them beside the agents — each with its label and the bundles it gives — with each agent's keepalive as the cache warmer holds it laid over its row. An agency that does not answer
// leaves the list empty and says so. The gate order is the gate unit's, which is not split yet, so none stands
// beside the list (docs/boundary.md, 「Screens of units not yet split」). Beside it stands the receiver's default
// answerer, by which a turn is told the chat agent's (docs/web.md, 「The name is the one answering on that row」).
export default defineEventHandler(async (event): Promise<AgentList> => {
  await requireUserSession(event);

  // Which agent's turns are the chat agent's is the receiver's word, read beside the agency's list.
  const answerer = defaultAnswerer();

  try {
    const [agents, workers] = await Promise.all([
      agencyCall(agency().GET("/agents")),
      agencyCall(agency().GET("/workers"))
    ]);

    return {
      reachable: true,
      agents: await withKeepalive(agentSummaries(agents.items, workers.items), keepaliveConsumer()),
      roles: agentRolesOf(agents),
      gateOrder: null,
      defaultAnswerer: await answerer
    };
  } catch (error) {
    // Which agents and roles there are is the agency's word, so none are offered while it is not answering.
    return { reachable: false, slow: unitSlow(error), agents: [], roles: [], gateOrder: null, defaultAnswerer: await answerer };
  }
});
