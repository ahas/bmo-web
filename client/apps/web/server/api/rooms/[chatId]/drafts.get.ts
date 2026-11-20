import { wording } from "#shared/wording";

import type { DraftRow } from "#shared/drafting";

// Every row one round's instruction pipeline wrote in a room, its answers whole, for the draft chip (docs/web.md, the room
// screen's draft chip). The pipeline is a round's own record, so it is the administrator's, as the verdicts are.
export default defineEventHandler(async (event): Promise<{ rows: DraftRow[] }> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const round = getQuery(event).round;

  if (typeof round !== "string" || round.trim() === "" || round.includes(",")) throw fail(400, wording("common.error.bad_action"));
  if ((await readableRooms(event)) !== "all") return { rows: [] };

  return { rows: (await readRoundDrafts(chatId, [round.trim()])).get(round.trim()) ?? [] };
});
