import { wording } from "#shared/wording";

import { ownerHeaders } from "../../../../../utils/owner-key";
import { requireReadableRoom, requireWritableRoom } from "../../../../../utils/room-reach";
import { exactAnswer, receiver } from "../../../../../utils/receiver";

import type { ForwardedMessage } from "#shared/types";

// A message the owner forwards into another room (the receiver's `docs/api.md`, 「Messages」): the record keeps a copy
// there under the owner's own number and name, its words the message's, marked with where it came from, and carries
// it to that room's providers. It wakes nobody. The copy is answered by the room it went into and the message kept
// there, so the screen can open it.
export default defineEventHandler(async (event): Promise<ForwardedMessage> => {
  const signed = await requireAdministrator(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const messageId = requireMessageId(event);
  const body = await readBody<{ to?: unknown }>(event);
  const to = Number(body?.to);

  if (!Number.isSafeInteger(to)) {
    throw fail(400, wording("room.error.forward_room"));
  }

  if (to === chatId) {
    throw fail(400, wording("room.error.forward_same_room"));
  }

  await requireWritableRoom(event, to);

  const answered = await exactAnswer<unknown>(
    receiver().POST("/rooms/{roomId}/messages/{messageId}/forwards", {
      params: { path: { roomId: chatId, messageId } },
      parseAs: "text",
      body: { to },
      headers: ownerHeaders(signed)
    })
  );

  // The record answers the room the copy went into and the message it stands as; the published client states that
  // answer as unknown, so its two fields are read by their names and held to their types, the copy's id exact.
  const copy = answered as { room?: unknown; id?: unknown };

  if (typeof copy.room !== "number" || typeof copy.id !== "string") {
    throw fail(502, wording("room.error.receiver_failed"));
  }

  return { room: copy.room, messageId: copy.id };
});
