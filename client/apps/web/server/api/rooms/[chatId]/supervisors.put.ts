import { wording } from "#shared/wording";

import { acting } from "../../../utils/console-rooms";
import { ADMINISTRATOR_ONLY, SUPERVISOR_CODES, receiver, receiverCall } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { RoomNamedSupervisors } from "#shared/types";

// A room's supervisors written whole, for the administrator alone, as his account: the receiver keeps the list as the
// room's own answerers and, in an avatar room, as the whole of who its words may call, and refuses a name the agency
// does not register (`unknown-supervisor`) and a change in another account's private room, which is refused here
// first (docs/web.md, 「Access」). The receiver's route declares `account` and reads no `by`, so the account goes and
// nothing else. An empty list is the setting left unset, which hands the room to the default answerer.
export default defineEventHandler(async (event): Promise<RoomNamedSupervisors> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ supervisors?: unknown }>(event);
  const names = body?.supervisors;

  if (!Array.isArray(names) || names.some((one) => typeof one !== "string")) throw fail(400, wording("room.error.supervisors_save_failed"));

  await requireWritableRoom(event, chatId);

  const answer = await receiverCall(
    receiver().PUT("/rooms/{roomId}/supervisors", { params: { path: { roomId: chatId } }, body: { supervisors: names, ...acting(signed) } }),
    { passStatus: [403], codes: { ...ADMINISTRATOR_ONLY, ...SUPERVISOR_CODES } }
  );

  return { supervisors: answer.supervisors };
});
