import { filedUnder } from "../../../../utils/agent-ownership";
import { roadOf, supervisorOwner } from "../../../../utils/axes";
import { rosterPersonForAdministrator } from "../../../../utils/roster";

import type { RosterAgent } from "#shared/roster";

// The agents filed under a person's account, for the administrator alone (docs/web.md, 「Organisation」, the people
// tab): their supervisors, then their role agents, each with its road and whether it is on.
export default defineEventHandler(async (event): Promise<RosterAgent[]> => {
  const person = await rosterPersonForAdministrator(event);
  const account = Number(person.user);
  const [supervisors, roles] = await Promise.all([
    agencyCall(agency().GET("/supervisors")).then((page) => page.items),
    agencyCall(agency().GET("/roles")).then((answer) => answer.roles)
  ]);

  return [
    ...supervisors
      .filter((supervisor) => supervisorOwner(supervisor) === account)
      .map((supervisor): RosterAgent => ({ name: supervisor.name, label: supervisor.label ?? supervisor.name, kind: "supervisor", role: null, road: roadOf(supervisor), enabled: true })),
    ...roles.flatMap((role) =>
      (role.agents ?? [])
        .filter((agent) => filedUnder(agent) === account)
        .map((agent): RosterAgent => ({ name: agent.name, label: agent.name, kind: "role", role: role.name, road: roadOf(agent), enabled: agent.enabled }))
    )
  ];
});
