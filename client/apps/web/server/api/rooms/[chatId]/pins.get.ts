import { requireReadableRoom } from "../../../utils/room-reach";
import { receiver, receiverCall } from "../../../utils/receiver";

import type { RoomPins } from "#shared/types";

// The room's pinned messages (the receiver's `docs/api.md`, 「Messages」): newest pin first, never a deleted one, read
// for the top bar's pinned button, which steps through them. The record keeps what a pin is; the console only reads
// what it says.
export default defineEventHandler(async (event): Promise<RoomPins> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const page = await receiverCall(receiver().GET("/rooms/{roomId}/pins", { params: { path: { roomId: chatId } } }));

  return {
    items: page.items.map((message) => ({
      messageId: message.id,
      senderName: message.senderName,
      text: message.text,
      pinnedAt: message.pinnedAt === null ? null : Math.floor(message.pinnedAt / 1000)
    }))
  };
});
