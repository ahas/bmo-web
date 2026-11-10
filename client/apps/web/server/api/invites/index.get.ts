import { listInvites } from "../../utils/account-service";
import { inviteFailure } from "../../utils/invites";
import { callerOf } from "../../utils/organization";

import type { Invite } from "@web/server-client";

// The open invitations the reader made, every open one for the administrator (docs/web.md, 「Settings」, the
// invitations section).
export default defineEventHandler(async (event): Promise<Invite[]> => {
  const signed = await signedInUser(event);

  try {
    return await listInvites(callerOf(signed));
  } catch (error) {
    throw inviteFailure(error);
  }
});
