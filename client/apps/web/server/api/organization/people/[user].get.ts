import { rosterPersonAsked } from "../../../utils/roster";

import type { RosterDetail } from "#shared/roster";

// One person the signed-in reader looks through, read-only (docs/web.md, 「System and organisation」, the people tab): their
// account, their unit's path and the units they head; the contact details for the administrator alone.
export default defineEventHandler(async (event): Promise<RosterDetail> => {
  return (await rosterPersonAsked(event)).person;
});
