import { appoint } from "../../../../utils/account-service";
import { fail } from "../../../../utils/fail";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

import { wording } from "#shared/wording";

// A person named to act for a unit's head until a moment still to come (docs/web.md, 「Organisation」, its chart): the
// account service decides who may, the administrator or a head of a unit above.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ user?: unknown; until?: unknown }>(event);

  if (typeof body?.user !== "string" || typeof body.until !== "number" || !Number.isInteger(body.until)) throw fail(400, wording("organization.error.bad_request"));

  try {
    await appoint(unit, body.user, body.until, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }

  setResponseStatus(event, 204);
});
