import type { RoomRead } from "#shared/types";

// The room read by the signed-in user up to one of its messages, the furthest the screen has seen.
// The mark only moves forward, so a tab that saw less than another moves nothing back.
export default defineEventHandler(async (event): Promise<RoomRead> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  // The message is named by its exact id, as the room's rows carry it (docs/web.md, 「A message's id」).
  const body = (await readBody(event)) as { messageId?: unknown } | null;
  const messageId = requireExactMessageId(body?.messageId);
  const unread = await markRead(signed, await ownSenders(signed, await ownerChat()), chatId, messageId, nowSeconds());

  // Every other open tab of the account hears the mark and reads its count again (docs/web.md, 「Unread messages」).
  publishConsoleEvent("room-read", { user: signed.name, chatId });

  return { unread: unread.count, firstUnread: unread.first, readTo: unread.from };
});
