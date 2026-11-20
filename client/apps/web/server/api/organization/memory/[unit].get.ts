import { unitNumber } from "../../../utils/organization";
import { orgMemoryView } from "../../../utils/org-memory";

import type { OrgMemoryView } from "#shared/org-memory";

// A unit's org memory: its own memories, its proposals and the memories of the units above it (docs/web.md,
// 「Organisation」, the org memory tab).
export default defineEventHandler(async (event): Promise<OrgMemoryView> => {
  const signed = await signedInUser(event);

  return await orgMemoryView(signed, unitNumber(getRouterParam(event, "unit")));
});
