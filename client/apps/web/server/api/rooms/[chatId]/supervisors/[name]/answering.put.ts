import { wording } from "#shared/wording";

import { acting } from "../../../../../utils/console-rooms";
import { ADMINISTRATOR_ONLY, SUPERVISOR_CODES, receiver, receiverCall } from "../../../../../utils/receiver";
import { requireWritableRoom } from "../../../../../utils/room-reach";

import type { RoomSupervisorAnswering } from "#shared/types";

// A supervisor standing in a room turned off there, so it answers nothing in the room while it stays, or on again,
// for the administrator alone, as his account (docs/web.md, the room screen's members tab): the receiver refuses a name the
// agency does not register (`unknown-supervisor`) and a change in another account's private room, which is refused
// here first (docs/web.md, 「Access」).
export default defineEventHandler(async (event): Promise<RoomSupervisorAnswering> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const name = getRouterParam(event, "name") ?? "";
  const body = await readBody<{ on?: unknown }>(event);

  if (name.trim() === "" || typeof body?.on !== "boolean") throw fail(400, wording("room.error.supervisor_answering_failed"));

  await requireWritableRoom(event, chatId);

  const answer = await receiverCall(
    receiver().PUT("/rooms/{roomId}/supervisors/{supervisorName}/answering", {
      params: { path: { roomId: chatId, supervisorName: name }, query: acting(signed) },
      body: { on: body.on }
    }),
    { passStatus: [403], codes: { ...ADMINISTRATOR_ONLY, ...SUPERVISOR_CODES } }
  );

  return { name: answer.agentName, on: answer.on };
});
