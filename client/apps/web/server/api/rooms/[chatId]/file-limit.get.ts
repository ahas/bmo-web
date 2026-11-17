import { roomFileLimit } from "../../../utils/receiver";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { RoomFileLimit } from "#shared/types";

// The largest file the room takes and the chat service declaring it, or none where none of its chat services declares
// one (docs/web.md, the room screen's input box), read as the room opens so its box turns a larger file away on the
// spot. Anyone who reads the room reads it.
export default defineEventHandler(async (event): Promise<RoomFileLimit> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  return { limit: await roomFileLimit(chatId) };
});
