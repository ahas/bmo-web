import { privacyOf, privateRoomsOf } from "../../../utils/room-privacy";
import { roomRoads } from "../../../utils/receiver";
import { requireReadableRoom } from "../../../utils/room-reach";

import { RECORD_ROAD } from "#shared/roads";

import type { RoomPrivacy } from "../../../utils/room-privacy";
import type { RoomOverlay } from "#shared/types";

// The reader's own BMO beside the room (docs/web.md, the room screen's overlay): whether the entry for
// that conversation stands in this room's menu at all, and the conversation itself — the first of the signed-in
// person's own supervisors, and its private room, the person's private conversation with it (docs/web.md,
// 「Access」): a room that supervisor answers and the receiver names the person's private room. A person with no
// supervisor of their own, or one whose private room does not stand, has none.
//
// The entry stands only where the console carries the room by itself: the room's roads name the record alone, and the
// room is no one's private room nor sealed. A room a chat service carries and any private room answer it away, for
// there the conversation would be said in the room the reader already stands in or over another's. A privacy or a
// road list the receiver cannot answer holds nothing, as every check the console cannot make offers nothing.
export default defineEventHandler(async (event): Promise<RoomOverlay> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const [privacy, roads] = await Promise.all([privacyOf(chatId).catch(() => null), roomRoads(chatId).catch(() => null)]);

  // The room the console carries by itself, or nothing to answer: the readers of a chat service's room and of any
  // private room are held to the conversation they already stand in.
  if (privacy === null || roads === null || heldAsPrivate(privacy) || carriedByAChatService(roads)) {
    return { stands: false, supervisor: null, label: null, room: null };
  }

  if (signed.id === null) return { stands: true, supervisor: null, label: null, room: null };

  const own = (await supervisorsOwnedBy(signed.id))[0];

  if (own === undefined) return { stands: true, supervisor: null, label: null, room: null };

  const [answered, privateRooms] = await Promise.all([
    receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: own.name } } })),
    privateRoomsOf(signed.id)
  ]);
  const alone = answered.items.map((room) => room.id).find((room) => room !== chatId && privateRooms.includes(room));

  return { stands: true, supervisor: own.name, label: own.label, room: alone ?? null };
});

// Whether the receiver keeps the room as someone's private room, or sealed as one before its account is known: the
// reader of their own stands in the conversation already, and the reader of another's would speak over it.
function heldAsPrivate(privacy: RoomPrivacy): boolean {
  return privacy.privateOf !== null || privacy.sealed;
}

// Whether any chat service carries the room beside the record the console reads it off, by the road's key alone.
function carriedByAChatService(roads: string[]): boolean {
  return roads.some((road) => road !== RECORD_ROAD);
}
