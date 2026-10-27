import { wording } from "#shared/wording";

import { ownerHeaders } from "../../../utils/owner-key";
import { requireReadableRoom } from "../../../utils/room-reach";
import { receiver, receiverCall } from "../../../utils/receiver";

import type { SentMessage } from "#shared/types";

// A sticker of the record's set sent into the room as the signed-in person's own message (the receiver's
// `docs/api.md`, 「Messages」): the emoji names the sticker, and the receiver keeps a message of the person's own with
// its kind `sticker`. A member's sticker stands on the record alone, since no road speaks in a member's account.
export default defineEventHandler(async (event): Promise<SentMessage> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const body = await readBody<{ emoji?: unknown }>(event);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";

  if (emoji === "") {
    throw fail(400, wording("room.error.sticker_empty"));
  }

  const message = await receiverCall(
    receiver().POST("/rooms/{roomId}/stickers", {
      params: { path: { roomId: chatId } },
      body: { emoji },
      headers: ownerHeaders(signed)
    })
  );

  return { messageId: message.id };
});
