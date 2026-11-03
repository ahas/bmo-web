import { gateOrderView } from "../utils/gate";
import { receiver, receiverCall } from "../utils/receiver";
import { repositorySummary, roleSummary, roleViewsOf, slotRunsOf, supervisorRooms, supervisorSummary } from "../utils/agent-list";

import type { AgentList } from "#shared/types";

// The console's agent list as the agency answers it (docs/web.md, 「Sidebar」): its supervisors with the rooms they
// speak in, its roles with the runs their slots hold now, and its repositories with their checkouts, and the
// roles with the bundles each gives. An agency that does not answer leaves the list empty and says so. Beside it
// stand the gate order as the gate unit serves it, none where that unit is not reached, and the receiver's default
// answerer, by which a turn is told the chat agent's (docs/web.md, 「The name is the one answering on that row」).
export default defineEventHandler(async (event): Promise<AgentList> => {
  await requireUserSession(event);

  // Which agent's turns are the chat agent's is the receiver's word, read beside the agency's lists.
  const answerer = defaultAnswerer();
  const order = gateOrderView();

  try {
    const [supervisors, roles, repositories, slots, sessions, rooms, newest] = await Promise.all([
      agencyCall(agency().GET("/supervisors")),
      agencyCall(agency().GET("/roles")),
      agencyCall(agency().GET("/repositories")),
      // What the slots hold, the sessions and the rooms only add to the lists; one that does not answer leaves its
      // part empty.
      agencyCall(agency().GET("/slots")).catch(() => null),
      agencyCall(agency().GET("/sessions")).then((page) => page.items).catch(() => []),
      receiverCall(receiver().GET("/rooms")).then((page) => page.items).catch(() => []),
      agencyCall(agency().GET("/jobs", { params: { query: { limit: 1 } } })).then((page) => page.items[0] ?? null).catch(() => null)
    ]);
    const runs = slotRunsOf(slots);
    // The rooms each supervisor's turns went into, read for each one; a supervisor whose list does not answer has
    // only the rooms its sessions and companionships name.
    const spoken = new Map(
      await Promise.all(
        supervisors.items.map(async (supervisor) => [
          supervisor.name,
          await agencyCall(agency().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: supervisor.name } } }))
            .then((page) => page.items)
            .catch(() => [])
        ] as const)
      )
    );
    const held = supervisorRooms(spoken, sessions, rooms);
    const jobRole = newest?.roleName ?? null;

    return {
      reachable: true,
      agents: [
        ...supervisors.items.map((supervisor) => supervisorSummary(supervisor, held.get(supervisor.name) ?? [])),
        ...roles.roles.map((role) => roleSummary(role, runs)),
        ...repositories.items.map(repositorySummary)
      ],
      roles: roleViewsOf(roles.roles),
      jobLine: roles.roles.find((role) => role.name === jobRole)?.line ?? null,
      gateOrder: await order,
      defaultAnswerer: await answerer
    };
  } catch {
    // Which supervisors, roles and repositories there are is the agency's word, so none are offered while it is not
    // answering.
    return { reachable: false, agents: [], roles: [], jobLine: null, gateOrder: await order, defaultAnswerer: await answerer };
  }
});
