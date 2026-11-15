import type { BackgroundCall, BackgroundView } from "#shared/types";

// What waits for this room, for the administrator alone (docs/web.md, the room screen's list of what waits): the asynchronous calls the tool
// host keeps running with their wake for this room, oldest first. A tool host that cannot be read answers none.
export default defineEventHandler(async (event): Promise<BackgroundView> => {
  await requireAdministrator(event);

  const room = requireChatId(event);
  const calls = (await runningCalls()) ?? [];

  return {
    calls: calls
      .map((call) => backgroundCall(call, room))
      .filter((call): call is BackgroundCall => call !== null)
      .sort((one, other) => one.startedAt - other.startedAt)
  };
});
