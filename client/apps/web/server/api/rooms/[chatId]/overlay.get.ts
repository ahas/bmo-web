import type { RoomOverlay } from "#shared/types";

// The reader's own BMO beside a group room (docs/web.md, the room screen's overlay): the first of the signed-in
// person's own supervisors, and the room it answers alone, the person's private conversation with it. A person with
// no supervisor of their own, or one that answers no room alone, has none.
export default defineEventHandler(async (event): Promise<RoomOverlay> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  if (signed.id === null) return { supervisor: null, label: null, room: null };

  const own = (await readSupervisors()).find((supervisor) => supervisor.ownerAccount === signed.id);

  if (own === undefined) return { supervisor: null, label: null, room: null };

  const rooms = await receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: own.name } } }));
  const alone = rooms.items.find((room) => room.alone && room.id !== chatId);

  return { supervisor: own.name, label: own.label, room: alone?.id ?? null };
});
