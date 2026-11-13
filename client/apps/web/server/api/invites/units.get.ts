import { inviteUnits } from "../../utils/account-service";
import { inviteFailure } from "../../utils/invites";
import { callerOf } from "../../utils/organization";

import type { InviteUnit } from "@web/server-client";

// The units the reader may invite into, each with its parent and its company (docs/web.md, 「Organisation settings」,
// the invitations tab).
export default defineEventHandler(async (event): Promise<InviteUnit[]> => {
  const signed = await signedInUser(event);

  try {
    return await inviteUnits(callerOf(signed));
  } catch (error) {
    throw inviteFailure(error);
  }
});
