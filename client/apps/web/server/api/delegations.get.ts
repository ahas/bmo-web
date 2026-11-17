import { agency, agencyCall } from "../utils/agency";
import { slotRunsOf } from "../utils/agent-list";

import type { components } from "@agency/client";

import type { DelegationPage, DelegationRun, RoleSlotRun } from "#shared/types";

type Delegation = components["schemas"]["Delegation"];

// The tasks a supervisor delegated to its double, as the agency lists them (the agency's `docs/api.md`,
// `GET /delegations`): the runs still waiting or running, in the order they were asked, then the latest ended one. Each
// carries the run its turn writes under, so the marker opens that run's log: the one the delegation names itself, which
// the agency keeps once it has ended, else the one the agency's `GET /slots` names for the slot that holds it by the
// same token. The agent its turn runs on is the one that slot names. The owner's own chat draws a run's marker from
// this answer alone, so every read replaces the whole list and nothing is kept here.
export default defineEventHandler(async (event): Promise<DelegationPage> => {
  await requireUserSession(event);

  const [page, slots] = await Promise.all([
    agencyCall(agency().GET("/delegations", { params: { query: { ended: 1 } } })),
    // The slot's run only stands in for one the delegation does not name yet; slots that cannot be read leave such
    // lines without one.
    agencyCall(agency().GET("/slots")).then(slotRunsOf).catch((): RoleSlotRun[] => [])
  ]);
  const held = new Map(slots.flatMap((slot) => (slot.token === null ? [] : [[slot.token, slot] as const])));

  return {
    items: page.items.map((delegation) => {
      const { runName: _name, runId: _id, ...view } = delegation;
      const slot = held.get(delegation.token);

      return { ...view, agentName: slot?.agent ?? null, run: runOf(delegation, slot) };
    })
  };
});

// The run a delegation's turn writes under: the one it names itself, else the one its slot names, else none yet. Its
// log is read under the agent its slot was let in on, else under its role, whose log holds every agent's.
function runOf(delegation: Delegation, slot: RoleSlotRun | undefined): DelegationRun | null {
  const name = delegation.runName ?? slot?.runName ?? null;

  return name === null ? null : { agent: slot?.agent ?? delegation.role, name, id: delegation.runId };
}
