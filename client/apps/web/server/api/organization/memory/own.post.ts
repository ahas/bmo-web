import { ownMemoryText } from "../../../utils/org-memory-draft";
import { writeOwnMemory } from "../../../utils/org-memory";

// A shared memory about the signed-in person written into their home unit's org brain (docs/web.md, 「Settings」).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  await writeOwnMemory(signed, ownMemoryText(await readBody(event)));
  setResponseStatus(event, 201);

  return null;
});
