import { machineShares } from "../../utils/account-service";
import { shareDecisionFailure } from "../../utils/invites";
import { callerOf } from "../../utils/organization";

import type { ShareAskRow } from "@web/server-client";

// The asks to share a machine the reader may decide, oldest first (docs/web.md, 「Organisation settings」, the
// invitations tab).
export default defineEventHandler(async (event): Promise<ShareAskRow[]> => {
  const signed = await signedInUser(event);

  try {
    return await machineShares(callerOf(signed));
  } catch (error) {
    throw shareDecisionFailure(error);
  }
});
