import { unitNumber } from "../../../../utils/organization";
import { dropOrgMemory } from "../../../../utils/org-memory";

// One of a unit's memories deleted, or a proposal declined: either stops holding (docs/web.md, 「Organisation」, the org
// memory tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  await dropOrgMemory(signed, unitNumber(getRouterParam(event, "unit")), unitNumber(getRouterParam(event, "memory")));

  return null;
});
