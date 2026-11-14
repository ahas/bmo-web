import { roomMembers } from "../../../utils/room-members";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { RoomMember } from "#shared/types";

// A room's members, each marked with the console account they are where the account service knows one (docs/web.md,
// the room screen's members entry). Read for whoever may read the room, each time the sheet opens.
export default defineEventHandler(async (event): Promise<RoomMember[]> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  return await roomMembers(chatId);
});
