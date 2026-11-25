import { signedInUser } from "../../../../../utils/accounts";
import { revokeRoomRight } from "../../../../../utils/console-rooms";
import { fail } from "../../../../../utils/fail";
import { requireWritableRoom } from "../../../../../utils/room-reach";

import { wording } from "#shared/wording";

// One right taken away from a member of the room by the signed-in login (docs/web.md, the room screen's members
// entry). As with giving one, the receiver says whose standing in the room reaches writing a member's rights and
// refuses anyone else, and the console adds only that this login changes the room's people at all.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);

  if (signed.id === null) throw fail(403, wording("members.error.grant_forbidden"));

  const account = getRouterParam(event, "user") ?? "";
  const asked = getQuery(event).right;
  const right = asked === "let-in" || asked === "take-out" ? asked : null;

  if (!/^\d+$/.test(account) || right === null) throw fail(400, wording("members.error.grant_failed"));

  await revokeRoomRight(room, account, String(signed.id), right);
  setResponseStatus(event, 204);
});
