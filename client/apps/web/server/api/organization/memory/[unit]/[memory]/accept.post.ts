import { unitNumber } from "../../../../../utils/organization";
import { acceptOrgMemory } from "../../../../../utils/org-memory";

// A proposal accepted as a fact of the unit (docs/web.md, 「System and organisation」, the org memory tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  await acceptOrgMemory(signed, unitNumber(getRouterParam(event, "unit")), unitNumber(getRouterParam(event, "memory")));

  return null;
});
