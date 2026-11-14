import { ROUND_FIGURES_AT_ONCE } from "#shared/config";
import { exactMessageIdOf } from "#shared/message-ids";
import { wording } from "#shared/wording";

import type { ExactMessageId, RoomRoundFigures } from "#shared/types";

// What the rounds of a room's answers spent and did (docs/web.md, the room screen's chip line), read once the page
// carrying them has landed so no page of the room waits on them. The answers are named by their exact ids, a list of
// them separated by commas.
export default defineEventHandler(async (event): Promise<RoomRoundFigures> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const named = getQuery(event).messages;
  const messageIds = typeof named === "string" && named.trim() !== "" ? named.split(",").map((one) => exactMessageIdOf(one.trim())) : [];

  if (messageIds.length === 0 || messageIds.length > ROUND_FIGURES_AT_ONCE || messageIds.includes(null)) {
    throw fail(400, wording("room.error.bad_message_id"));
  }

  return { items: await roundFigures(chatId, [...new Set(messageIds as ExactMessageId[])]) };
});
