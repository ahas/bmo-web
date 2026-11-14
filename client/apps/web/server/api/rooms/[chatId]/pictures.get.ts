import { exactMessageIdOf } from "#shared/message-ids";

import { exactAnswer, receiver, wireId } from "../../../utils/receiver";

import type { ReceiverPictures } from "../../../utils/receiver";
import type { RoomPicturePage } from "#shared/types";

// The pictures a room holds, which the picture viewer walks across the whole room: the receiver's stretch of them
// (its `docs/boundary-api.md`, 「A room's pictures」), asked for by the picture the viewer holds, by its exact id, and
// the side it walks.
const CURSORS = ["at", "before", "after"] as const;

export default defineEventHandler(async (event): Promise<RoomPicturePage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  const limit = Number(query.limit);
  const cursors = {
    ...Object.fromEntries(
      CURSORS.flatMap((name) => {
        const id = exactMessageIdOf(query[name]);

        return id === null ? [] : [[name, wireId(id)]];
      })
    ),
    ...(query.limit !== undefined && Number.isSafeInteger(limit) ? { limit } : {})
  } as { at?: number; before?: number; after?: number; limit?: number };
  const page = await exactAnswer<ReceiverPictures>(
    receiver().GET("/rooms/{roomId}/pictures", { params: { path: { roomId: chatId }, query: cursors }, parseAs: "text" })
  );

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
