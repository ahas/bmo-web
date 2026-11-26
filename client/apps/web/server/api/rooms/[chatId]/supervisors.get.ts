import { administratorBy } from "../../../utils/console-rooms";
import { roomSupervisors } from "../../../utils/room-supervisors";

import type { RoomSupervisorsView } from "#shared/types";

// The supervisors a room names and the ones it may still be told to call, for the administrator alone (docs/web.md,
// the room screen's chat services): who answers the room and, in an avatar room, the whole of who its words may call.
// An empty list is the setting left unset, which hands the room to the default answerer. The candidates leave out the
// agents already standing in the room, and no one but the administrator reads or writes this list, so no reader is
// shown a room he may not change.
export default defineEventHandler(async (event): Promise<RoomSupervisorsView> => {
  const signed = await requireAdministrator(event);

  return await roomSupervisors(requireChatId(event), administratorBy(signed));
});
