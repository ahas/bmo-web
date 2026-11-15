import { wording } from "#shared/wording";

import { acting } from "../../../utils/console-rooms";
import { receiverRoute } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { RoomProvidersView } from "#shared/types";

// A room's chat providers set, whole, for the administrator alone: the list the dialog holds once a switch was
// turned, handed to the receiver as it stands with his account. The receiver's rule turns on the list alone, so
// nothing here reads which provider a key names. Another account's private room is refused here and by the receiver
// (docs/web.md, 「Access」); the published client names no account on the route, so it is asked on its address
// (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<RoomProvidersView> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ providers?: unknown }>(event);
  const providers = body?.providers;

  if (!Array.isArray(providers) || providers.length === 0 || !providers.every((key): key is string => typeof key === "string" && key !== "")) {
    throw fail(400, wording("room.error.providers_shape"));
  }

  await requireWritableRoom(event, chatId);
  await receiverRoute(`/rooms/${chatId}/providers`, { method: "PUT", body: { providers, ...acting(signed) } }, { passStatus: [403] });

  return await roomProviders(chatId);
});
