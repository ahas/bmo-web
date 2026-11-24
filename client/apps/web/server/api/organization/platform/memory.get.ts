import { baseMemoryView } from "../../../utils/base-memory";

import type { BaseMemoryView } from "#shared/org-memory";

// The base's standing memories and its candidates, the administrator's alone (docs/web.md, 「Organisation」, the org
// memory tab with the platform chosen).
export default defineEventHandler(async (event): Promise<BaseMemoryView> => {
  return await baseMemoryView(await requireAdministrator(event));
});
