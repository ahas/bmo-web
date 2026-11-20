import type { BackgroundCall, BackgroundView } from "#shared/types";

// What waits for this room, for the administrator alone (docs/web.md, the room screen's list of what waits), oldest
// first: the asynchronous calls the tool host keeps running with their wake for this room, a call naming no room
// standing in the owner's private chat where its wake goes; and the background work a supervisor's program still runs
// for this room, as the agency lists it. A unit that cannot be read leaves its part out.
export default defineEventHandler(async (event): Promise<BackgroundView> => {
  await requireAdministrator(event);

  const room = requireChatId(event);
  const [calls, work] = await Promise.all([runningCalls().then((read) => read ?? []), roomWork(room).then((read) => read ?? [])]);
  // A call naming no room wakes in the owner's private chat; asked only where some call names none.
  const ownersChat = calls.some((call) => typeof call !== "object" || call === null || typeof Reflect.get(call, "room") !== "number") ? await ownerChat() : null;

  return {
    calls: [...calls.map((call) => backgroundCall(call, room, ownersChat)).filter((call): call is BackgroundCall => call !== null), ...work].sort(
      (one, other) => one.startedAt - other.startedAt
    )
  };
});
