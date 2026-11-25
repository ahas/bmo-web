import { dropBaseMemory } from "../../../../utils/base-memory";
import { unitNumber } from "../../../../utils/organization";

// One of the base's memories moved to `invalidated`, the administrator's alone (docs/web.md, 「System and organisation」, the org
// memory tab with the platform chosen).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);

  await dropBaseMemory(signed, unitNumber(getRouterParam(event, "memory")));

  return null;
});
