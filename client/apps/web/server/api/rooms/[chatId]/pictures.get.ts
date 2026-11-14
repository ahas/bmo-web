import { exactMessageIdOf } from "#shared/message-ids";

import { exactAnswer, receiver } from "../../../utils/receiver";

import type { ExactPaths, ReceiverPictures } from "../../../utils/receiver";
import type { RoomPicturePage } from "#shared/types";

// The pictures a room holds, which the picture viewer walks across the whole room: the receiver's stretch of them
// (its `docs/boundary-api.md`, 「A room's pictures」), asked for by the picture the viewer holds, by its exact id, and
// the side it walks.
const CURSORS = ["at", "before", "after"] as const;

type PicturesQuery = NonNullable<ExactPaths["/rooms/{roomId}/pictures"]["get"]["parameters"]["query"]>;

export default defineEventHandler(async (event): Promise<RoomPicturePage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  const limit = Number(query.limit);
  const cursors: PicturesQuery = {};

  for (const name of CURSORS) {
    const id = exactMessageIdOf(query[name]);

    if (id !== null) cursors[name] = id;
  }

  if (query.limit !== undefined && Number.isSafeInteger(limit)) cursors.limit = limit;

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
