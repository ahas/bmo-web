import { wording } from "#shared/wording";

import { ownerHeaders } from "../../../../../utils/owner-key";
import { requireWritableRoom } from "../../../../../utils/room-reach";
import { MESSAGE_IDS, receiverRoute } from "../../../../../utils/receiver";

import type { ForwardedMessage } from "#shared/types";

// A message the administrator forwards into another room (the receiver's `docs/api.md`, 「Messages」): the record keeps
// a copy there under the forwarding account's sender and the name it is shown by — the owner's sender for the owner's
// account, the account's record identity for any other — its words the message's, marked with where it came from, and carries it to that room's
// providers. It wakes nobody, and is refused out of or into a room that is another account's private room. The copy
// is answered by the room it went into and the message kept there, so the screen can open it. The published client
// names no account on the route, so it is asked on its address (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<ForwardedMessage> => {
  const signed = await requireAdministrator(event);

  const chatId = requireChatId(event);
  const messageId = requireMessageId(event);
  const body = await readBody<{ to?: unknown }>(event);
  const to = Number(body?.to);

  if (!Number.isSafeInteger(to)) {
    throw fail(400, wording("room.error.forward_room"));
  }

  if (to === chatId) {
    throw fail(400, wording("room.error.forward_same_room"));
  }

  // A message is forwarded only out of a room he may change as his own: another account's private room is its
  // account's own words, read by him and taken nowhere.
  await requireWritableRoom(event, chatId);
  await requireWritableRoom(event, to);

  const answered = await receiverRoute<unknown>(
    `/rooms/${chatId}/messages/${messageId}/forwards`,
    { method: "POST", body: { to, ...(signed.id === null ? {} : { account: signed.id, name: signed.name }) }, headers: ownerHeaders(signed) },
    { passStatus: [403], exactIds: MESSAGE_IDS }
  );

  // The record answers the room the copy went into and the message it stands as; the published client states that
  // answer as unknown, so its two fields are read by their names and held to their types, the copy's id exact.
  const copy = answered as { room?: unknown; id?: unknown };

  if (typeof copy.room !== "number" || typeof copy.id !== "string") {
    throw fail(502, wording("room.error.receiver_failed"));
  }

  return { room: copy.room, messageId: copy.id };
});
