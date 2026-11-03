import { gateOrderView } from "../utils/gate";
import { receiver, receiverCall } from "../utils/receiver";
import { repositorySummary, roleSummary, roleViewsOf, slotRunsOf, supervisorRooms, supervisorSummary } from "../utils/agent-list";

import type { AgentList } from "#shared/types";

// The console's agent list as the agency answers it (docs/web.md, 「Sidebar」): its supervisors with the rooms they
// answer as the receiver names them, its roles with the runs their slots hold now, and its repositories with their checkouts, and the
// roles with the bundles each gives. An agency that does not answer leaves the list empty and says so. Beside it
// stand the gate order as the gate unit serves it, none where that unit is not reached, and the supervisor the receiver's
// default answerer setting names, by which a turn is told the default answerer's (docs/web.md, 「The name is the one answering on that row」).
export default defineEventHandler(async (event): Promise<AgentList> => {
  await requireUserSession(event);

  // Which supervisor answers the rooms naming none is the receiver's word, read beside the agency's lists.
  const answerer = defaultAnswerer();
  const order = gateOrderView();

  try {
    const [supervisors, roles, repositories, slots, newest] = await Promise.all([
      agencyCall(agency().GET("/supervisors")),
      agencyCall(agency().GET("/roles")),
      agencyCall(agency().GET("/repositories")),
      // What the slots hold only adds to the lists; an answer that does not come leaves its part empty.
      agencyCall(agency().GET("/slots")).catch(() => null),
      agencyCall(agency().GET("/jobs", { params: { query: { limit: 1 } } })).then((page) => page.items[0] ?? null).catch(() => null)
    ]);
    const runs = slotRunsOf(slots);
    // The rooms each supervisor answers, as the receiver names them, and the rooms its turns went into, as the agency's
    // run ledger names them, read for each one; a list that does not answer leaves its part empty.
    const [answered, spoken] = await Promise.all([
      Promise.all(
        supervisors.items.map(async (supervisor) => [
          supervisor.name,
          await receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: supervisor.name } } }))
            .then((page) => page.items)
            .catch(() => [])
        ] as const)
      ),
      Promise.all(
        supervisors.items.map(async (supervisor) => [
          supervisor.name,
          await agencyCall(agency().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: supervisor.name } } }))
            .then((page) => page.items)
            .catch(() => [])
        ] as const)
      )
    ]);
    const held = supervisorRooms(new Map(answered), new Map(spoken));
    const jobRole = newest?.roleName ?? null;
    const named = await answerer;

    return {
      reachable: true,
      agents: [
        ...supervisors.items.map((supervisor) => supervisorSummary(supervisor, held.get(supervisor.name) ?? [], named)),
        ...roles.roles.map((role) => roleSummary(role, runs)),
        ...repositories.items.map(repositorySummary)
      ],
      roles: roleViewsOf(roles.roles),
      jobLine: roles.roles.find((role) => role.name === jobRole)?.line ?? null,
      gateOrder: await order,
      defaultAnswerer: named
    };
  } catch {
    // Which supervisors, roles and repositories there are is the agency's word, so none are offered while it is not
    // answering.
    return { reachable: false, agents: [], roles: [], jobLine: null, gateOrder: await order, defaultAnswerer: await answerer };
  }
});
