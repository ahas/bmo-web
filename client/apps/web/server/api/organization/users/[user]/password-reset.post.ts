import { resetPassword } from "../../../../utils/account-security";
import { callerOf } from "../../../../utils/organization";
import { linkBase, securityFailure } from "../../../../utils/sign-in";

import type { ResetMade } from "@web/server-client";

// A person's password reset by the administrator or one of their heads (docs/web.md, 「Organisation」, the people tab):
// a link mailed, or handed back once to be given to the person; nobody sets or sees the password.
export default defineEventHandler(async (event): Promise<ResetMade> => {
  const signed = await signedInUser(event);
  const user = Number(getRouterParam(event, "user"));

  try {
    return await resetPassword(user, linkBase(event, true) ?? "", callerOf(signed));
  } catch (error) {
    throw securityFailure(error);
  }
});
