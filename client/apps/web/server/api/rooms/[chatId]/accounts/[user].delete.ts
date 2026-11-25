import { signedInUser } from "../../../../utils/accounts";
import { takeOutOfRoom } from "../../../../utils/console-rooms";
import { fail } from "../../../../utils/fail";
import { requireEntry } from "../../../../utils/room-entry";
import { requireWritableRoom, roomReachChanged } from "../../../../utils/room-reach";

import { wording } from "#shared/wording";

// A member taken out of the room (docs/web.md, the room screen's section on opening a room and letting people in): the
// signed-in login leaving, which asks no one, or taking another out where the account service says they may take
// members out, their call right there going with the membership. The receiver writes who took whom out, and the person
// reads the room no more, their open streams falling silent on it at once and their open tabs told their rooms changed.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);
  const user = getRouterParam(event, "user") ?? "";

  if (!/^\d+$/.test(user)) throw fail(400, wording("members.error.entry_failed"));

  const leaving = signed.id !== null && user === String(signed.id);

  if (!leaving) await requireEntry(signed, room, user, "take-out");

  await takeOutOfRoom(room, user, leaving ? user : String(signed.id));
  roomReachChanged({ account: Number(user), room, left: true });
  setResponseStatus(event, 204);
});
