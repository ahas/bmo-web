import { wording } from "#shared/wording";

import { ownerHeaders } from "../../../utils/owner-key";
import { requireWritableRoom } from "../../../utils/room-reach";
import { MESSAGE_IDS, receiverRoute } from "../../../utils/receiver";

import type { ExactMessage } from "../../../utils/receiver";
import type { SentMessage } from "#shared/types";

// A sticker of the record's set sent into the room as the signed-in person's own message (the receiver's
// `docs/api.md`, 「Messages」): the emoji names the sticker, and the receiver keeps a message of the person's own with
// its kind `sticker`. A member's sticker stands on the record alone, since no road speaks in a member's account. The
// account it is sent as rides beside the emoji, so the receiver refuses it in another account's private room; the
// published client names no account on the route, so it is asked on its address (docs/boundary.md, 「Gaps the console
// meets」).
export default defineEventHandler(async (event): Promise<SentMessage> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  const body = await readBody<{ emoji?: unknown }>(event);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";

  if (emoji === "") {
    throw fail(400, wording("room.error.sticker_empty"));
  }

  await requireWritableRoom(event, chatId);

  const message = await receiverRoute<ExactMessage>(
    `/rooms/${chatId}/stickers`,
    { method: "POST", body: { emoji, ...(signed.id === null ? {} : { account: signed.id }) }, headers: ownerHeaders(signed) },
    { passStatus: [403], exactIds: MESSAGE_IDS }
  );

  return { messageId: message.id };
});
