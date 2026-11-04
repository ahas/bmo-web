import { receiver, receiverCall } from "../../../utils/receiver";

import type { RoomSituation } from "#shared/types";

// The room's situation note as it stands, with when it last changed (docs/web.md, the room screen's situation entry;
// the receiver's `docs/drafting.md`, 「The situation note」). The receiver owns the note; a room it holds none for
// answers none.
export default defineEventHandler(async (event): Promise<RoomSituation> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  return await receiverCall(receiver().GET("/rooms/{roomId}/situation", { params: { path: { roomId: chatId } } }));
});
