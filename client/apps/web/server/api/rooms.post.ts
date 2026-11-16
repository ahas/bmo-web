import { ROOM_TITLE_LIMIT } from "#shared/config";
import { wording } from "#shared/wording";

import { signedInUser } from "../utils/accounts";
import { supervisorsOwnedBy } from "../utils/axes";
import { acting, openRecordRoom } from "../utils/console-rooms";
import { roomReachChanged } from "../utils/room-reach";

import type { RoomAdded } from "#shared/types";
import type { H3Event } from "h3";

type Mode = "avatar" | "record-only";

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

// A group room opened in the console by any account (docs/web.md, the room screen's section on opening a room and
// letting people in): a room on the record alone, titled as typed, naming the opener's own BMO, their first
// supervisor, as the one that answers it, and the opener's account as its first member. The room stands in the
// opener's company and belongs to the opener's unit, since a room belongs to its leader's unit; a person with no BMO
// of their own opens none.
async function openedRoom(event: H3Event, asked: unknown): Promise<RoomAdded> {
  const signed = await signedInUser(event);
  const title = typeof asked === "string" ? asked.trim() : "";

  if (title === "") throw fail(400, wording("room.error.open_title"));
  if (title.length > ROOM_TITLE_LIMIT) throw fail(400, wording("common.error.too_long", { n: ROOM_TITLE_LIMIT }));
  if (signed.id === null) throw fail(403, wording("room.error.no_account"));

  const own = (await supervisorsOwnedBy(signed.id))[0];

  if (own === undefined) throw fail(409, wording("room.error.open_no_bmo"));

  const room = await openRecordRoom(title, own.name, String(signed.id));

  roomReachChanged({ account: signed.id, room: room.id, left: false });

  return { chatId: room.id, title: room.title ?? title };
}

// A room added from a chat service, for the administrator: the service, the mode it is added in, a title that may
// be left out, and one of the room as the service numbers it, a contact to start a one-to-one with, or the
// contacts to start a group with, which needs the title; handed to the receiver as they came (the receiver's
// `docs/api.md`, 「Rooms」). A group may name its supervisor, one the signed-in person owns or none: the group
// carries only its creator's supervisor, never another person's, and a group added with none carries none. The
// receiver checks each against what the service declares, asks the service to start a conversation where one is
// chosen, in the signed-in person's own account as the contacts were listed in, and its refusals are said in the
// pack's words.
export default defineEventHandler(async (event): Promise<RoomAdded> => {
  const body = await readBody<{ provider?: unknown; roomId?: unknown; contactId?: unknown; contactIds?: unknown; mode?: unknown; title?: unknown; supervisor?: unknown }>(event);

  if (body?.provider === undefined || body.provider === null) return await openedRoom(event, body?.title);

  const signed = await requireAdministrator(event);
  const title = typeof body?.title === "string" && body.title.trim() !== "" ? body.title.trim() : null;
  const refused = (): never => {
    throw fail(400, wording("room.error.room_add_refused"));
  };

  if (typeof body?.provider !== "string" || (body.mode !== "avatar" && body.mode !== "record-only")) refused();

  const provider = body.provider as string;
  const mode = body.mode as Mode;
  const chosen = [body.roomId, body.contactId, body.contactIds].filter((one) => one !== undefined && one !== null).length;

  if (chosen !== 1) refused();

  const groupContacts = Array.isArray(body.contactIds) && body.contactIds.length > 0 && body.contactIds.every(isId) && title !== null ? body.contactIds : null;
  const supervisor = typeof body.supervisor === "string" && body.supervisor.trim() !== "" ? body.supervisor.trim() : null;

  // Only a group started here names a supervisor, and only its creator's own; nothing is asked of the receiver
  // before that stands.
  if (supervisor !== null && (groupContacts === null || !(await supervisorOwnedBy(supervisor, signed.id)))) {
    throw fail(400, wording("room.error.room_add_supervisor"));
  }

  // A start goes out in the account its contacts were listed in: the signed-in person's own where the model gives
  // them a user, else the service's own, which is the owner's too.
  let room;

  if (isId(body.roomId)) {
    room = await receiverCall(receiver().POST("/rooms", { body: { provider, roomId: body.roomId, mode, title } }));
  } else if (isId(body.contactId)) {
    room = await receiverCall(receiver().POST("/rooms", { body: { provider, contactId: body.contactId, mode, ...(await chatAccountOf(signed)), ...(title === null ? {} : { title }) } }));
  } else if (groupContacts !== null) {
    room = await receiverCall(receiver().POST("/rooms", { body: { provider, contactIds: groupContacts, mode, title, ...(await chatAccountOf(signed)) } }));
  } else {
    return refused();
  }

  // The group stands before it can be named, so its supervisor is written on it as it comes; a group with none is
  // left naming none, which the default answerer answers.
  if (supervisor !== null) {
    await receiverCall(
      receiver().PUT("/rooms/{roomId}/supervisors", { params: { path: { roomId: room.id } }, body: { supervisors: [supervisor], ...acting(signed) } }),
      { codes: SUPERVISOR_CODES }
    );
  }

  return { chatId: room.id, title: room.title };
});
