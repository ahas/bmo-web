import { signedInUser } from "../../../utils/accounts";
import { roomEntry } from "../../../utils/room-entry";
import { roomMembers } from "../../../utils/room-members";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { RoomMembersView } from "#shared/types";

// A room's members by either road, each marked with the console account they are where the account service knows one,
// what the room's chat service gave of them, and whether the reader may let people in and take members out
// (docs/web.md, the room screen's members entry). Read for whoever may read the room, each time the sheet opens.
export default defineEventHandler(async (event): Promise<RoomMembersView> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const [{ members, chatMembers }, entry] = await Promise.all([roomMembers(chatId), roomEntry(await signedInUser(event), chatId)]);

  return { members, chatMembers, entry };
});
