import { rosterCompanies } from "../../../utils/account-service";
import { callerOf } from "../../../utils/organization";
import { rosterFailure } from "../../../utils/roster";

import type { RosterUnit } from "#shared/roster";

// The companies the signed-in reader looks through on the people tab (docs/web.md, 「Organisation」, the people tab):
// every one for the administrator, the companies whose own unit they head for anyone else, and none for the rest, so the
// console tells from it whether the tab stands. The account service decides.
export default defineEventHandler(async (event): Promise<RosterUnit[]> => {
  const signed = await signedInUser(event);

  try {
    return await rosterCompanies(callerOf(signed));
  } catch (error) {
    throw rosterFailure(error);
  }
});
