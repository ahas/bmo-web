import { wording } from "#shared/wording";

import type { RoomAddPage } from "#shared/types";

// The modes the chat service says the room holds, where it says any: a room that names none takes whatever its service
// offers. A room the service reads in the owner's account alone holds no avatar mode, so it is added read-only.
function modesOf(room: unknown): string[] | null {
  const modes = (room as { modes?: unknown } | null)?.modes;

  return Array.isArray(modes) ? modes.filter((one): one is string => typeof one === "string") : null;
}

// A page of the rooms a chat service's account is in, as the service answers them through the receiver, each with
// whether the receiver already holds it, for the administrator choosing one to add; `after` and `limit` go as they
// came (the receiver's `docs/api.md`, 「Rooms」).
export default defineEventHandler(async (event): Promise<RoomAddPage> => {
  await requireAdministrator(event);

  const key = getRouterParam(event, "key") ?? "";
  const query = getQuery(event);
  const after = Number(query.after);
  const limit = Number(query.limit);

  if (key === "") throw fail(400, wording("room.error.room_add_refused"));

  const page = await receiverCall(
    receiver().GET("/providers/{key}/rooms", {
      params: {
        path: { key },
        query: { ...(Number.isSafeInteger(after) && query.after !== undefined ? { after } : {}), ...(Number.isSafeInteger(limit) && limit > 0 ? { limit } : {}) }
      }
    })
  );

  return { items: page.items.map((room) => ({ id: room.id, title: room.title, kind: room.kind, held: room.held ?? room.mode !== null, mode: room.mode, modes: modesOf(room) })), more: page.more };
});
