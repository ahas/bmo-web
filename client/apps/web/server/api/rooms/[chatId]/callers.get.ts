import { roomCallers } from "../../../utils/account-service";
import { signedInUser } from "../../../utils/accounts";
import { callerFailure } from "../../../utils/callers";
import { ownerKeyOf } from "../../../utils/owner-key";

import type { RoomCallers } from "@web/server-client";

// A room's callers, and whether the reader may change them (docs/web.md, the room screen's callers entry).
export default defineEventHandler(async (event): Promise<RoomCallers> => {
  const signed = await signedInUser(event);
  const key = ownerKeyOf(signed);
  const room = requireChatId(event);

  await requireReadableRoom(event, room);

  if (key === null) return { room, callers: [], mayChange: false };

  try {
    return await roomCallers(room, key);
  } catch (error) {
    throw callerFailure(error);
  }
});
