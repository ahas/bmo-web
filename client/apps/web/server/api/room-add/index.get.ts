import type { RoomAddService } from "#shared/types";

// The chat services a room may be added from, for the administrator: every provider the receiver names that takes
// a mode, with what it declares it lists and starts and the modes a room on it may be added in (the receiver's
// `docs/api.md`, 「Rooms」). One that lists neither rooms nor contacts still stands, so the dialog can say why
// nothing is added from it. What a service declares decides; no service is named here.
export default defineEventHandler(async (event): Promise<RoomAddService[]> => {
  await requireAdministrator(event);

  const listed = await receiverCall(receiver().GET("/providers"));

  return listed.items
    .filter((provider) => provider.roomModes.length > 0)
    .map((provider) => ({
      key: provider.key,
      label: chatRoadName(provider.key),
      modes: provider.roomModes,
      listsRooms: provider.listsRooms,
      listsContacts: provider.listsContacts ?? false,
      startsChats: provider.startsChats ?? false,
      startsGroups: provider.startsGroups ?? false
    }));
});
