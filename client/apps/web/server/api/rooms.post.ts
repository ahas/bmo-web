import { wording } from "#shared/wording";

import type { RoomAdded } from "#shared/types";

type Mode = "avatar" | "record-only";

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

// A room added from a chat service, for the administrator: the service, the mode it is added in, a title that may
// be left out, and one of the room as the service numbers it, a contact to start a one-to-one with, or the
// contacts to start a group with, which needs the title; handed to the receiver as they came (the receiver's
// `docs/api.md`, 「Rooms」). The receiver checks each against what the service declares, asks the service to
// start a conversation where one is chosen, and its refusals are said in the pack's words.
export default defineEventHandler(async (event): Promise<RoomAdded> => {
  await requireAdministrator(event);

  const body = await readBody<{ provider?: unknown; roomId?: unknown; contactId?: unknown; contactIds?: unknown; mode?: unknown; title?: unknown }>(event);
  const title = typeof body?.title === "string" && body.title.trim() !== "" ? body.title.trim() : null;
  const refused = (): never => {
    throw fail(400, wording("room.error.room_add_refused"));
  };

  if (typeof body?.provider !== "string" || (body.mode !== "avatar" && body.mode !== "record-only")) refused();

  const provider = body.provider as string;
  const mode = body.mode as Mode;
  const chosen = [body.roomId, body.contactId, body.contactIds].filter((one) => one !== undefined && one !== null).length;

  if (chosen !== 1) refused();

  let room;

  if (isId(body.roomId)) {
    room = await receiverCall(receiver().POST("/rooms", { body: { provider, roomId: body.roomId, mode, title } }));
  } else if (isId(body.contactId)) {
    room = await receiverCall(receiver().POST("/rooms", { body: { provider, contactId: body.contactId, mode, ...(title === null ? {} : { title }) } }));
  } else if (Array.isArray(body.contactIds) && body.contactIds.length > 0 && body.contactIds.every(isId) && title !== null) {
    room = await receiverCall(receiver().POST("/rooms", { body: { provider, contactIds: body.contactIds, mode, title } }));
  } else {
    return refused();
  }

  return { chatId: room.id, title: room.title };
});
