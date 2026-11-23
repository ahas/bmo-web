import { dropOwnMemory } from "../../../../utils/org-memory";
import { unitNumber } from "../../../../utils/organization";

// One of the signed-in person's own shared memories moved to `invalidated` (docs/web.md, 「Settings」).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  await dropOwnMemory(signed, unitNumber(getRouterParam(event, "memory")));

  return null;
});
