import type { BackgroundCall, BackgroundView } from "#shared/types";

// What waits for this room, for the administrator alone (docs/web.md, the room screen's list of what waits): the
// asynchronous calls the tool host keeps running with their wake for this room, oldest first, a call naming no room
// standing in the owner's private chat where its wake goes. A tool host that cannot be read answers none.
export default defineEventHandler(async (event): Promise<BackgroundView> => {
  await requireAdministrator(event);

  const room = requireChatId(event);
  const calls = (await runningCalls()) ?? [];
  // A call naming no room wakes in the owner's private chat; asked only where some call names none.
  const ownersChat = calls.some((call) => typeof call !== "object" || call === null || typeof Reflect.get(call, "room") !== "number") ? await ownerChat() : null;

  return {
    calls: calls
      .map((call) => backgroundCall(call, room, ownersChat))
      .filter((call): call is BackgroundCall => call !== null)
      .sort((one, other) => one.startedAt - other.startedAt)
  };
});
