import { makeInvite } from "../../utils/account-service";
import { inviteFailure } from "../../utils/invites";
import { callerOf, unitNumber } from "../../utils/organization";

import type { Invite } from "@web/server-client";

// An invitation made into a unit the reader heads, or any for the administrator, with the person's name where the
// maker gives one (docs/web.md, 「System and organisation」, the invitations tab).
export default defineEventHandler(async (event): Promise<Invite> => {
  const signed = await signedInUser(event);
  const body = await readBody<{ unit?: unknown; head?: unknown; hours?: unknown; fullName?: unknown }>(event);
  const hours = typeof body?.hours === "number" && Number.isInteger(body.hours) ? body.hours : 72;
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";

  try {
    return await makeInvite({ unit: unitNumber(body?.unit), head: body?.head === true, hours, fullName }, callerOf(signed));
  } catch (error) {
    throw inviteFailure(error);
  }
});
