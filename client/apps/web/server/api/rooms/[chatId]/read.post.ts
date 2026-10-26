import { wording } from "#shared/wording";

import type { RoomRead } from "#shared/types";

// The room read by the signed-in user up to one of its messages, the furthest the screen has seen.
// The mark only moves forward, so a tab that saw less than another moves nothing back.
export default defineEventHandler(async (event): Promise<RoomRead> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const body = (await readBody(event)) as { messageId?: unknown } | null;
  const messageId = typeof body?.messageId === "number" ? body.messageId : Number.NaN;

  if (!Number.isSafeInteger(messageId)) {
    throw fail(400, wording("room.error.bad_message_id"));
  }

  const unread = await markRead(signed, await ownSenders(signed, await ownerChat()), chatId, messageId, nowSeconds());

  // Every other open tab of the account hears the mark and reads its count again (docs/web.md, 「Unread messages」).
  publishConsoleEvent("room-read", { user: signed.name, chatId });

  return { unread: unread.count, firstUnread: unread.first, readTo: unread.from };
});
