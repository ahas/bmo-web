import type { RoomAddService } from "#shared/types";

// The chat services a room may be added from, for the administrator: every provider the receiver names that
// declares it lists the rooms of its account, with the modes a room on it may be added in (the receiver's
// `docs/api.md`, 「Rooms」). What a service declares decides; no service is named here.
export default defineEventHandler(async (event): Promise<RoomAddService[]> => {
  await requireAdministrator(event);

  const listed = await receiverCall(receiver().GET("/providers"));

  return listed.items.filter((provider) => provider.listsRooms).map((provider) => ({ key: provider.key, label: provider.label, modes: provider.roomModes }));
});
