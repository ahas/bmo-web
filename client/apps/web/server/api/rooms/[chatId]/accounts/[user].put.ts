import { setRoomCaller } from "../../../../utils/account-service";
import { signedInUser } from "../../../../utils/accounts";
import { callerFailure } from "../../../../utils/callers";
import { letIntoRoom } from "../../../../utils/console-rooms";
import { fail } from "../../../../utils/fail";
import { requireEntry } from "../../../../utils/room-entry";
import { requireWritableRoom, roomReachChanged } from "../../../../utils/room-reach";

import { wording } from "#shared/wording";

// A person let into the room by the signed-in login, granted `ask` on the room at the same moment, the call right
// membership gives (docs/web.md, the room screen's section on opening a room and letting people in). The account
// service says who may let whom in; the receiver keeps the member and writes who let whom in. The person's open
// streams hear the room from then on.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);
  const user = getRouterParam(event, "user") ?? "";

  if (!/^\d+$/.test(user)) throw fail(400, wording("members.error.entry_failed"));

  await requireEntry(signed, room, user);
  await letIntoRoom(room, user, String(signed.id));
  roomReachChanged({ account: Number(user), room, left: false });

  try {
    await setRoomCaller(room, user, true, String(signed.id));
  } catch (error) {
    throw callerFailure(error);
  }

  setResponseStatus(event, 204);
});
