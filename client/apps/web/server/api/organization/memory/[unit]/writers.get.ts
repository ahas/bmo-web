import { unitNumber } from "../../../../utils/organization";
import { orgMemoryWriters } from "../../../../utils/org-memory";

import type { OrgMemoryWritersView } from "#shared/org-memory";

// The people granted a unit's org memory write and those who may be, for a head of the unit (docs/web.md,
// 「System and organisation」, the org memory tab).
export default defineEventHandler(async (event): Promise<OrgMemoryWritersView> => {
  const signed = await signedInUser(event);

  return await orgMemoryWriters(signed, unitNumber(getRouterParam(event, "unit")));
});
