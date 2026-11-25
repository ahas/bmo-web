import { privateRoomsOf } from "../../../utils/room-privacy";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { RoomOverlay } from "#shared/types";

// The reader's own BMO beside a group room (docs/web.md, the room screen's overlay): the first of the signed-in
// person's own supervisors, and its private room, the person's private conversation with it (docs/web.md,
// 「Access」): a room that supervisor answers and the receiver names the person's private room. A person with no
// supervisor of their own, or one whose private room does not stand, has none.
export default defineEventHandler(async (event): Promise<RoomOverlay> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  if (signed.id === null) return { supervisor: null, label: null, room: null };

  const own = (await supervisorsOwnedBy(signed.id))[0];

  if (own === undefined) return { supervisor: null, label: null, room: null };

  const [answered, privateRooms] = await Promise.all([
    receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: own.name } } })),
    privateRoomsOf(signed.id)
  ]);
  const alone = answered.items.map((room) => room.id).find((room) => room !== chatId && privateRooms.includes(room));

  return { supervisor: own.name, label: own.label, room: alone ?? null };
});
