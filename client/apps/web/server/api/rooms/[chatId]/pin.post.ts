import { wording } from "#shared/wording";

import { acting } from "../../../utils/console-rooms";
import { receiverRoute } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { PinnedRooms } from "#shared/types";

// A refusal of a pin of another account's private room, 403 `private-room`, is said as the refusal it is.
const CHANGES = { passStatus: [403] };

// This room pinned or let go, for the administrator alone: the pinned order is one list for every reader, and the
// receiver writes it (its `POST /pinned-rooms` and `DELETE /pinned-rooms/{roomId}`), answering the order as it now
// stands. Every reader sees the pin, so another account's private room is pinned by nobody but that account: the pin is
// asked as the signed-in account, refused here and by the receiver (docs/web.md, 「Access」). The published client
// names no account on these routes, so each is asked on its address (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<PinnedRooms> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ pinned?: unknown }>(event);

  if (typeof body?.pinned !== "boolean") {
    throw fail(400, wording("room.error.pin_direction"));
  }

  await requireWritableRoom(event, chatId);

  const order = body.pinned
    ? await receiverRoute<{ roomIds?: unknown }>("/pinned-rooms", { method: "POST", body: { room: chatId, ...acting(signed) } }, CHANGES)
    : await receiverRoute<{ roomIds?: unknown }>(`/pinned-rooms/${chatId}${signed.id === null ? "" : `?account=${signed.id}`}`, { method: "DELETE" }, CHANGES);
  const rooms = Array.isArray(order.roomIds) ? order.roomIds.filter((one): one is number => typeof one === "number") : [];

  return { rooms } satisfies PinnedRooms;
});
