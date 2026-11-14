import type { RoomPast } from "#shared/types";

// Where a room's line begins, for the line the room screen stands above its oldest message (docs/web.md, the room
// screen's 「Where a room's line begins」): the chat services the room's past comes over from, each a service of the
// room that reads a room's past back. Where the receiver cannot say, the answer says so rather than naming none, so the screen never
// calls a line the conversation's start on a guess.
export default defineEventHandler(async (event): Promise<RoomPast> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  return { readers: await roomPastReaders(chatId).catch(() => null) };
});
