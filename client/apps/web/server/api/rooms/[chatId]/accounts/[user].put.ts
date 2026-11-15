import { setRoomCaller } from "../../../../utils/account-service";
import { signedInUser } from "../../../../utils/accounts";
import { callerFailure } from "../../../../utils/callers";
import { letIntoRoom } from "../../../../utils/console-rooms";
import { fail } from "../../../../utils/fail";
import { requireEntry } from "../../../../utils/room-entry";
import { requireWritableRoom } from "../../../../utils/room-reach";

import { wording } from "#shared/wording";

// A person let into the room by the signed-in login, with the call into the room granted at the same moment where the
// body asks for it (docs/web.md, the room screen's section on opening a room and letting people in). The account
// service says who may let whom in; the receiver keeps the member and writes who let whom in.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);
  const user = getRouterParam(event, "user") ?? "";

  if (!/^\d+$/.test(user)) throw fail(400, wording("members.error.entry_failed"));

  const body = await readBody<{ caller?: unknown } | null>(event);

  await requireEntry(signed, room, user);
  await letIntoRoom(room, user, String(signed.id));

  if (body?.caller === true) {
    try {
      await setRoomCaller(room, user, true, String(signed.id));
    } catch (error) {
      throw callerFailure(error);
    }
  }

  setResponseStatus(event, 204);
});
