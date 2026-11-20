import { orgMemoryUnits } from "../../../utils/account-service";
import { callerOf, organizationFailure } from "../../../utils/organization";

import type { OrgMemoryUnitView } from "#shared/org-memory";

// The units whose org memory the reader writes, each with whether they head it (docs/web.md, 「Organisation」, the org
// memory tab).
export default defineEventHandler(async (event): Promise<OrgMemoryUnitView[]> => {
  const signed = await signedInUser(event);
  const caller = callerOf(signed);

  if (caller.key === "") return [];

  try {
    return (await orgMemoryUnits(caller)).map((one) => ({ id: one.id, name: one.name, parent: one.parent ?? null, company: one.company, head: one.head }));
  } catch (error) {
    throw organizationFailure(error);
  }
});
