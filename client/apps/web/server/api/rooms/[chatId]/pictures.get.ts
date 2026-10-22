import type { RoomPicturePage } from "#shared/types";

// The pictures a room holds, which the picture viewer walks across the whole room: the receiver's stretch of them
// (its `docs/boundary-api.md`, 「A room's pictures」), asked for by the picture the viewer holds and the side it walks.
const CURSORS = ["at", "before", "after", "limit"] as const;

export default defineEventHandler(async (event): Promise<RoomPicturePage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  const asked = new URLSearchParams();

  for (const name of CURSORS) {
    const value = Number(query[name]);

    if (query[name] !== undefined && Number.isSafeInteger(value)) asked.set(name, String(value));
  }

  const cursors = Object.fromEntries([...asked].map(([name, value]) => [name, Number(value)])) as {
    at?: number;
    before?: number;
    after?: number;
    limit?: number;
  };
  const page = await receiverCall(receiver().GET("/rooms/{roomId}/pictures", { params: { path: { roomId: chatId }, query: cursors } }));

  return {
    pictures: page.items.map((picture) => ({
      messageId: picture.id,
      album: picture.album,
      senderName: picture.senderName,
      sentAt: Math.floor(picture.sentAt / 1000),
      text: picture.text,
      file: picture.file === null ? null : { name: picture.file.name ?? "", bytes: picture.file.bytes, type: picture.file.type ?? "" }
    })),
    hasMore: page.more,
    before: page.before,
    total: page.total
  };
});
