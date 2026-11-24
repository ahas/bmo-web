import { editBaseMemory } from "../../../../utils/base-memory";
import { unitNumber } from "../../../../utils/organization";
import { memoryDraft } from "../../../../utils/org-memory-draft";

// A new version written over one of the base's memories, the administrator's alone (docs/web.md, 「Organisation」, the
// org memory tab with the platform chosen).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);
  const memory = unitNumber(getRouterParam(event, "memory"));

  await editBaseMemory(signed, memory, memoryDraft(await readBody(event)));

  return null;
});
