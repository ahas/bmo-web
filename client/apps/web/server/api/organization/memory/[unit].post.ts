import { unitNumber } from "../../../utils/organization";
import { memoryDraft } from "../../../utils/org-memory-draft";
import { writeOrgMemory } from "../../../utils/org-memory";

// A memory written into a unit's org brain (docs/web.md, 「System and organisation」, the org memory tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));

  await writeOrgMemory(signed, unit, memoryDraft(await readBody(event)));
  setResponseStatus(event, 201);

  return null;
});
