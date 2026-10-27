import { requireReadableRoom } from "../../../utils/room-reach";
import { receiver, receiverCall } from "../../../utils/receiver";

import type { StickerSet } from "#shared/types";

// The stickers the record keeps (the receiver's `docs/api.md`, 「Messages」), each by its emoji: the deployment's set,
// offered in the input box as it is. The console keeps no sticker list of its own.
export default defineEventHandler(async (event): Promise<StickerSet> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const page = await receiverCall(receiver().GET("/stickers"));

  return { items: page.items.map((sticker) => sticker.emoji) };
});
