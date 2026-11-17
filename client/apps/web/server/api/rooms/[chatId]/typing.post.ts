import { wording } from "#shared/wording";

import { signedInUser } from "../../../utils/accounts";
import { receiverRoute } from "../../../utils/receiver";
import { looksUnseen, requireWritableRoom } from "../../../utils/room-reach";

// The signed-in account writing in a room's input box, or stopping (docs/web.md, 「Presence and typing」): told to the
// receiver, which shows it to the room's readers and hands it to the room's chat services in the writer's own voice.
// Only a reader who may write in the room tells it; the administrator's tab in a room that is not his own tells
// nothing, and neither does a console login standing before the account model, which has no account. A mark is no
// message: whatever the receiver answers is let go, and the box never waits on it.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);

  const body = (await readBody(event)) as { on?: unknown } | null;

  if (typeof body?.on !== "boolean") throw fail(400, wording("room.error.bad_typing"));

  const signed = await signedInUser(event);

  if (signed.id === null || (await looksUnseen(event, chatId))) return { ok: true };

  try {
    await receiverRoute(`/rooms/${chatId}/typing`, { method: "POST", body: { account: signed.id, on: body.on } });
  } catch (error) {
    console.warn(`room ${chatId}: a typing mark was not told to the receiver: ${String(error)}`);
  }

  return { ok: true };
});
