import { takePost } from "../../../../../utils/account-service";
import { fail } from "../../../../../utils/fail";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../../utils/organization";

import { wording } from "#shared/wording";

// A person's post in a unit taken away, with the head grant it carried (docs/web.md, 「Organisation」, its chart).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const user = getRouterParam(event, "user") ?? "";

  if (!/^[1-9][0-9]*$/.test(user)) throw fail(400, wording("organization.error.bad_request"));

  try {
    await takePost(unit, user, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }

  setResponseStatus(event, 204);
});
