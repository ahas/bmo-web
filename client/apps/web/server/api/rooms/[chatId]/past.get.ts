import type { RoomPast } from "#shared/types";

// Where a room's line begins, for the line the room screen stands above its oldest message (docs/web.md, the room
// screen's 「Where a room's line begins」): the chat services that read the room's past back, named. A receiver
// that cannot say names none, and the screen then reads the oldest message as the conversation's start.
export default defineEventHandler(async (event): Promise<RoomPast> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  return { readers: await roomPastReaders(chatId).catch(() => []) };
});
