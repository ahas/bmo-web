import { administratorBy } from "../../../utils/console-rooms";

import type { RoomModeView } from "#shared/types";

// A room's mode, for the administrator alone, read off its registration as the web unit knows him (the receiver's
// `docs/api.md`, a room's registration). A room that was never added has none.
export default defineEventHandler(async (event): Promise<RoomModeView> => {
  const signed = await requireAdministrator(event);

  return await roomMode(requireChatId(event), administratorBy(signed));
});
