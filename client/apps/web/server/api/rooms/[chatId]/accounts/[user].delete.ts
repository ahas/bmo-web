import { setRoomCaller } from "../../../../utils/account-service";
import { signedInUser } from "../../../../utils/accounts";
import { takeOutOfRoom } from "../../../../utils/console-rooms";
import { fail } from "../../../../utils/fail";
import { requireEntry } from "../../../../utils/room-entry";
import { requireWritableRoom } from "../../../../utils/room-reach";

import { wording } from "#shared/wording";

// A member taken out of the room (docs/web.md, the room screen's section on opening a room and letting people in): the
// signed-in login leaving, which asks no one, or taking another out where the account service says they may let people
// in, the person's call grant there going with them. The receiver writes who took whom out, and the person reads the
// room no more.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);
  const user = getRouterParam(event, "user") ?? "";

  if (!/^\d+$/.test(user)) throw fail(400, wording("members.error.entry_failed"));

  const leaving = signed.id !== null && user === String(signed.id);

  if (!leaving) await requireEntry(signed, room, user);

  await takeOutOfRoom(room, user, leaving ? user : String(signed.id));

  // The grant goes where the one taking the person out may change it; one who may not leaves it to those who may.
  if (!leaving) {
    await setRoomCaller(room, user, false, String(signed.id)).catch((error: unknown) => {
      console.warn(`room ${room}: the call grant of ${user} stayed as they were taken out: ${String(error)}`);
    });
  }

  setResponseStatus(event, 204);
});
