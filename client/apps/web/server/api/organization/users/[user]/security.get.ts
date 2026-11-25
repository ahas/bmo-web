import { accountSecurity } from "../../../../utils/account-security";
import { callerOf } from "../../../../utils/organization";
import { securityFailure } from "../../../../utils/sign-in";

import type { AccountSecurityView } from "#shared/account-security";

// What stands of a person's account's security, for the administrator and the person's heads (docs/web.md,
// 「System and organisation」, the people tab's account tab): the account service decides who reads it.
export default defineEventHandler(async (event): Promise<AccountSecurityView> => {
  const signed = await signedInUser(event);
  const user = Number(getRouterParam(event, "user"));

  try {
    return await accountSecurity(user, callerOf(signed));
  } catch (error) {
    throw securityFailure(error);
  }
});
