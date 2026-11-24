import type { RoomProvidersView } from "#shared/types";

// A room's chat providers, for the administrator alone: a room's providers are one setting of its registration, which
// the receiver keeps (its `docs/receiver.md`, 「A room's chat providers」), fixed as the room is added. The ones the room
// is on, each by its name, and whether one of them offers the avatar mode (docs/web.md, the room screen's chat services).
export default defineEventHandler(async (event): Promise<RoomProvidersView> => {
  await requireAdministrator(event);

  return await roomProviders(requireChatId(event));
});
