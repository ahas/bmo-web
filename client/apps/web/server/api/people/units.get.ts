import { signedInUser } from "../../utils/accounts";
import { findUnits } from "../../utils/room-units";

import type { UnitChoice } from "#shared/people";

// The organisations of the reader's company whose name holds the words, each with the units above it and how many
// people stand in it, for a room's let-in search (docs/web.md, the room screen's section on opening a room and
// letting people in).
export default defineEventHandler(async (event): Promise<UnitChoice[]> => {
  const signed = await signedInUser(event);
  const asked = getQuery(event).q;

  if (typeof asked !== "string") return [];

  return await findUnits(signed, asked);
});
