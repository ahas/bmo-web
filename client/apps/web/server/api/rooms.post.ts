import { wording } from "#shared/wording";

import type { RoomAdded } from "#shared/types";

// A room added from a chat service's account, for the administrator: the service, the room as the service numbers
// it, the mode it is added in and a title that may be left out, handed to the receiver as they came (the
// receiver's `docs/api.md`, 「Rooms」). The receiver checks each against what the service declares, and its
// refusals are said in the pack's words.
export default defineEventHandler(async (event): Promise<RoomAdded> => {
  await requireAdministrator(event);

  const body = await readBody<{ provider?: unknown; roomId?: unknown; mode?: unknown; title?: unknown }>(event);
  const title = typeof body?.title === "string" && body.title.trim() !== "" ? body.title.trim() : null;

  if (typeof body?.provider !== "string" || typeof body.roomId !== "number" || !Number.isSafeInteger(body.roomId) || (body.mode !== "avatar" && body.mode !== "record-only")) {
    throw fail(400, wording("room.error.room_add_refused"));
  }

  const room = await receiverCall(receiver().POST("/rooms", { body: { provider: body.provider, roomId: body.roomId, mode: body.mode, title } }));

  return { chatId: room.id, title: room.title };
});
