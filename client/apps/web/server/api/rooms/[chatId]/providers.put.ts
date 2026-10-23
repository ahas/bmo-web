import { wording } from "#shared/wording";

import type { RoomProvidersView } from "#shared/types";

// A room's chat providers set, whole, for the administrator alone: the list the dialog holds once a switch was
// turned, handed to the receiver as it stands. The receiver's rule turns on the list alone, so nothing here reads
// which provider a key names.
export default defineEventHandler(async (event): Promise<RoomProvidersView> => {
  await requireAdministrator(event);
  const chatId = requireChatId(event);
  const body = await readBody<{ providers?: unknown }>(event);
  const providers = body?.providers;

  if (!Array.isArray(providers) || providers.length === 0 || !providers.every((key): key is string => typeof key === "string" && key !== "")) {
    throw fail(400, wording("room.error.providers_shape"));
  }

  await receiverCall(receiver().PUT("/rooms/{roomId}/providers", { params: { path: { roomId: chatId } }, body: { providers } }));

  return await roomProviders(chatId);
});
