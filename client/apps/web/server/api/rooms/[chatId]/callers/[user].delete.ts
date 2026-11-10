import { setRoomCaller } from "../../../../utils/account-service";
import { signedInUser } from "../../../../utils/accounts";
import { callerFailure } from "../../../../utils/callers";
import { fail } from "../../../../utils/fail";
import { ownerKeyOf } from "../../../../utils/owner-key";

import { wording } from "#shared/wording";

// A person no longer a caller of the room, as the signed-in login (docs/web.md, the room screen's callers entry); the account service says who may.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const key = ownerKeyOf(signed);
  const room = requireChatId(event);

  await requireReadableRoom(event, room);
  const user = getRouterParam(event, "user") ?? "";

  if (!/^\d+$/.test(user)) throw fail(400, wording("callers.error.failed"));
  if (key === null) throw fail(403, wording("callers.error.forbidden"));

  try {
    await setRoomCaller(room, user, false, key);
  } catch (error) {
    throw callerFailure(error);
  }

  setResponseStatus(event, 204);
});
