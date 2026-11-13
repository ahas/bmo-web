import { makeInvite } from "../../utils/account-service";
import { inviteFailure } from "../../utils/invites";
import { callerOf, unitNumber } from "../../utils/organization";

import type { Invite } from "@web/server-client";

// An invitation made into a unit the reader heads, or any for the administrator (docs/web.md, 「Organisation
// settings」, the invitations tab).
export default defineEventHandler(async (event): Promise<Invite> => {
  const signed = await signedInUser(event);
  const body = await readBody<{ unit?: unknown; head?: unknown; hours?: unknown }>(event);
  const hours = typeof body?.hours === "number" && Number.isInteger(body.hours) ? body.hours : 72;

  try {
    return await makeInvite(unitNumber(body?.unit), body?.head === true, hours, callerOf(signed));
  } catch (error) {
    throw inviteFailure(error);
  }
});
