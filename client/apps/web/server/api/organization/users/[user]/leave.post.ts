import { markLeft } from "../../../../utils/account-service";
import { LEAVE_CODES, callerOf, organizationFailure } from "../../../../utils/organization";

// A person marked left, their account's sign-in disabled for good (docs/web.md, 「System and organisation」; docs/accounts.md,
// 「A person who leaves」): the account service decides who may, the administrator or a head of the person's unit.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const user = String(getRouterParam(event, "user") ?? "");

  try {
    await markLeft(user, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, LEAVE_CODES);
  }

  setResponseStatus(event, 204);
});
