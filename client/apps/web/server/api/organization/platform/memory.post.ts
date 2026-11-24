import { writeBaseMemory } from "../../../utils/base-memory";
import { memoryDraft } from "../../../utils/org-memory-draft";

// A memory written into the base, the administrator's alone (docs/web.md, 「Organisation」, the org memory tab with the
// platform chosen).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);

  await writeBaseMemory(signed, memoryDraft(await readBody(event)));
  setResponseStatus(event, 201);

  return null;
});
