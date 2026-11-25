import { signedInUser } from "../../../../../utils/accounts";
import { grantRoomRight } from "../../../../../utils/console-rooms";
import { fail } from "../../../../../utils/fail";
import { requireWritableRoom } from "../../../../../utils/room-reach";

import { wording } from "#shared/wording";

import type { RoomGrants } from "#shared/types";

// One right given to a member of the room by the signed-in login (docs/web.md, the room screen's members entry):
// letting a person in, or taking a member out, which the receiver keeps beside the membership. Who may write a
// member's rights is the receiver's own word — the administrator, the room's leader or a head of the leader's unit —
// and it refuses anyone else; the console adds only its own gate that this login changes the room's people at all. The
// member's rights as they now stand answer, so the row goes on standing as the receiver keeps them.
export default defineEventHandler(async (event): Promise<RoomGrants> => {
  const signed = await signedInUser(event);
  const room = requireChatId(event);

  await requireWritableRoom(event, room);

  if (signed.id === null) throw fail(403, wording("members.error.grant_forbidden"));

  const account = getRouterParam(event, "user") ?? "";
  const asked = (await readBody<{ right?: unknown } | null>(event))?.right;
  const right = asked === "let-in" || asked === "take-out" ? asked : null;

  if (!/^\d+$/.test(account) || right === null) throw fail(400, wording("members.error.grant_failed"));

  return await grantRoomRight(room, account, String(signed.id), right);
});
