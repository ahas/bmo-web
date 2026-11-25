import { receiver, receiverCall } from "../../../utils/receiver";

import type { RoomSupervisorsView } from "#shared/types";

// The supervisors a room names, for the administrator alone, read off the room as the receiver holds it (the
// receiver's `docs/api.md`, 「Rooms」): who answers the room and, in an avatar room, the whole of who its words may
// call. An empty list is the setting left unset, which hands the room to the default answerer.
export default defineEventHandler(async (event): Promise<RoomSupervisorsView> => {
  await requireAdministrator(event);

  const room = await receiverCall(receiver().GET("/rooms/{roomId}", { params: { path: { roomId: requireChatId(event) } } }));

  return { supervisors: room.supervisors };
});
