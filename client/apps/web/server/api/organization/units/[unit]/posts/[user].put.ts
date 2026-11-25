import { givePost } from "../../../../../utils/account-service";
import { fail } from "../../../../../utils/fail";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../../utils/organization";

import { wording } from "#shared/wording";

// A post given to a person in a unit of their company, or changed: its role by key, none for no role, and the unit's
// head or not (docs/web.md, 「System and organisation」, its chart and the people tab).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const user = getRouterParam(event, "user") ?? "";
  const body = await readBody<{ role?: unknown; head?: unknown }>(event);
  const role = body?.role;

  if (!/^[1-9][0-9]*$/.test(user) || typeof body?.head !== "boolean" || !(role === null || role === undefined || typeof role === "string")) {
    throw fail(400, wording("organization.error.bad_request"));
  }

  try {
    await givePost(unit, user, { role: typeof role === "string" && role !== "" ? role : null, head: body.head }, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }

  setResponseStatus(event, 204);
});
