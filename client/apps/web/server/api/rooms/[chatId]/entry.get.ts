import { signedInUser } from "../../../utils/accounts";
import { roomEntry } from "../../../utils/room-entry";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { RoomEntry } from "#shared/types";

// What the reader may do to the room's members, read as the room's screen opens so its menu offers the let-in entry to a
// reader who may let people in (docs/web.md, the room screen's section on opening a room and letting people in).
export default defineEventHandler(async (event): Promise<RoomEntry> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  return await roomEntry(await signedInUser(event), chatId);
});
