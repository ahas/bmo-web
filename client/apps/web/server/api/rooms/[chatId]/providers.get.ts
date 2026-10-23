import type { RoomProvidersView } from "#shared/types";

// A room's chat providers, for the administrator alone: a room's providers are one setting of its registration, which
// the receiver keeps (its `docs/receiver.md`, 「A room's chat providers」). Every provider the receiver names, and the
// ones the room is on.
export default defineEventHandler(async (event): Promise<RoomProvidersView> => {
  await requireAdministrator(event);

  return await roomProviders(requireChatId(event));
});
