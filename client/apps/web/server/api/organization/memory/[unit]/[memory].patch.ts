import { unitNumber } from "../../../../utils/organization";
import { memoryDraft } from "../../../../utils/org-memory-draft";
import { editOrgMemory } from "../../../../utils/org-memory";

// A new version written over one of a unit's memories (docs/web.md, 「Organisation」, the org memory tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const memory = unitNumber(getRouterParam(event, "memory"));

  await editOrgMemory(signed, unit, memory, memoryDraft(await readBody(event)));

  return null;
});
