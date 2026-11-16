import { filedUnder } from "../../../../utils/agent-ownership";
import { supervisorOwner, supervisorViewOf } from "../../../../utils/axes";
import { rosterPersonForAdministrator } from "../../../../utils/roster";

import type { components } from "@agency/client/schema";
import type { RoadView } from "#shared/axes";
import type { RosterAgent } from "#shared/roster";

// The road a role agent names, on or off; none where it names no provider and model of its own.
function roleAgentRoad(agent: components["schemas"]["RoleAgent"]): RoadView | null {
  return agent.provider == null || agent.model == null
    ? null
    : { provider: agent.provider, model: agent.model, effort: agent.effort ?? null, thinking: agent.thinking ?? null, answerTokens: agent.answerTokens ?? null };
}

// The agents filed under a person's account, for the administrator alone (docs/web.md, 「Organisation」, the people
// tab): their supervisors, then their role agents, each with its road and whether it is on.
export default defineEventHandler(async (event): Promise<RosterAgent[]> => {
  const person = await rosterPersonForAdministrator(event);
  const account = Number(person.user);
  const [supervisors, roles, answerer] = await Promise.all([
    agencyCall(agency().GET("/supervisors")).then((page) => page.items),
    agencyCall(agency().GET("/roles")).then((answer) => answer.roles),
    defaultAnswerer()
  ]);

  return [
    ...supervisors
      .filter((supervisor) => supervisorOwner(supervisor) === account)
      .map((supervisor): RosterAgent => ({ name: supervisor.name, label: supervisor.label ?? supervisor.name, kind: "supervisor", role: null, road: supervisorViewOf(supervisor, answerer).road, enabled: true })),
    ...roles.flatMap((role) =>
      (role.agents ?? [])
        .filter((agent) => filedUnder(agent) === account)
        .map((agent): RosterAgent => ({ name: agent.name, label: agent.name, kind: "role", role: role.name, road: roleAgentRoad(agent), enabled: agent.enabled }))
    )
  ];
});
