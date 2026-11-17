import { agency, agencyCall } from "../utils/agency";
import { slotRunsOf } from "../utils/agent-list";

import type { DelegationPage, DelegationRun, RoleSlotRun } from "#shared/types";

// The tasks a supervisor delegated to its double, as the agency lists them (the agency's `docs/api.md`,
// `GET /delegations`): the runs still waiting or running, in the order they were asked, then the latest ended one. Each
// carries the run its turn writes under, which the agency's `GET /slots` names for the slot that holds it by the same
// token, so the marker opens that run's log. The owner's own chat draws a run's marker from this answer alone, so every
// read replaces the whole list and nothing is kept here.
export default defineEventHandler(async (event): Promise<DelegationPage> => {
  await requireUserSession(event);

  const [page, slots] = await Promise.all([
    agencyCall(agency().GET("/delegations", { params: { query: { ended: 1 } } })),
    // The run only adds a link to a line; slots that cannot be read leave every line without one.
    agencyCall(agency().GET("/slots")).then(slotRunsOf).catch((): RoleSlotRun[] => [])
  ]);
  const runs = new Map(slots.flatMap((slot) => (slot.token === null ? [] : [[slot.token, slot] as const])));

  return {
    items: page.items.map((item) => {
      const slot = runs.get(item.token);
      const run: DelegationRun | null =
        slot === undefined || slot.runName === null ? null : { agent: slot.agent ?? item.agentName ?? item.role, name: slot.runName };

      return { ...item, run };
    })
  };
});
