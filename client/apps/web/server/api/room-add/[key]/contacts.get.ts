import { wording } from "#shared/wording";

import type { RoomAddContactPage } from "#shared/types";

// A page of the contacts of a chat service's account, as the service answers them through the receiver, each with
// the one-to-one the account already has with it and whether the receiver holds that room, for the administrator
// starting a conversation to add; `after` and `limit` go as they came (the receiver's `docs/api.md`, 「Rooms」). They
// are the signed-in person's own account's, named by their user id where the model gives them one and never by
// anything the request says; with none, and for the owner, whose account is the deployment's own, the service answers
// its own account's.
export default defineEventHandler(async (event): Promise<RoomAddContactPage> => {
  const signed = await requireAdministrator(event);

  const key = getRouterParam(event, "key") ?? "";
  const query = getQuery(event);
  const after = Number(query.after);
  const limit = Number(query.limit);

  if (key === "") throw fail(400, wording("room.error.room_add_refused"));

  const page = await receiverCall(
    receiver().GET("/providers/{key}/contacts", {
      params: {
        path: { key },
        query: {
          ...(Number.isSafeInteger(after) && query.after !== undefined ? { after } : {}),
          ...(Number.isSafeInteger(limit) && limit > 0 ? { limit } : {}),
          ...(await chatAccountOf(signed))
        }
      }
    })
  );

  return { items: page.items.map((contact) => ({ id: contact.id, name: contact.name, kind: contact.kind, roomId: contact.roomId ?? null, held: contact.held, mode: contact.mode ?? null })), more: page.more };
});
