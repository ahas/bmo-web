import { rosterPage } from "../../../utils/account-service";
import { callerOf } from "../../../utils/organization";
import { rosterAskOf, rosterFailure } from "../../../utils/roster";

import type { RosterPage } from "#shared/roster";

// One page of the people the signed-in reader looks through, as the address's words and filters narrow them (docs/web.md,
// 「Organisation」, the people tab): searched and paged by the account service, never read whole here.
export default defineEventHandler(async (event): Promise<RosterPage> => {
  const signed = await signedInUser(event);

  try {
    return await rosterPage(rosterAskOf(getQuery(event)), callerOf(signed));
  } catch (error) {
    throw rosterFailure(error);
  }
});
