import { privateRoomsOf } from "../../../utils/room-privacy";

// The room the start guide's last step opens (docs/web.md, 「The start guide」): the signed-in reader's first own
// supervisor's private room, or, for an administrator who owns none, the first room the default answerer speaks in.
// None where neither stands.
export default defineEventHandler(async (event): Promise<{ room: number | null }> => {
  const signed = await signedInUser(event);

  if (signed.id === null) return { room: null };

  const roomsOf = async (supervisor: string): Promise<number[]> =>
    (await receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: supervisor } } }))).items.map((one) => one.id);
  const own = (await supervisorsOwnedBy(signed.id).catch(() => []))[0];

  if (own !== undefined) {
    const [rooms, privateRooms] = await Promise.all([roomsOf(own.name), privateRoomsOf(signed.id)]);

    return { room: rooms.find((room) => privateRooms.includes(room)) ?? null };
  }

  if (!signed.administrator) return { room: null };

  const answerer = (await receiverCall(receiver().GET("/default-answerer"))).supervisor;

  return { room: answerer === null || answerer === undefined ? null : ((await roomsOf(answerer))[0] ?? null) };
});
