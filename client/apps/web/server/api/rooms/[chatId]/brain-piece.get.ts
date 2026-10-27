import { wording } from "#shared/wording";

import type { BrainPiece } from "#shared/drafting";

// What one piece a round read is, for the brain list's modal (docs/web.md, the room screen's brain chip). The brain is the
// administrator's screen alone, so a member is refused.
export default defineEventHandler(async (event): Promise<BrainPiece> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);

  const query = getQuery(event);
  const path = typeof query.path === "string" ? query.path.trim() : "";
  const agent = typeof query.agent === "string" ? query.agent.trim() : "";
  const memoryId = typeof query.memoryId === "string" && /^\d+$/.test(query.memoryId) ? Number(query.memoryId) : null;

  if (path === "" || agent === "") throw fail(400, wording("common.error.bad_action"));

  return await brainPiece(signed, chatId, agent, path, memoryId);
});
