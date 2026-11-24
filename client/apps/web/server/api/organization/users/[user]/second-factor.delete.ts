import { resetFactor } from "../../../../utils/account-security";
import { callerOf } from "../../../../utils/organization";
import { securityFailure } from "../../../../utils/sign-in";

// A person's second factor reset by the administrator or one of their heads (docs/web.md, 「Organisation」, the people
// tab).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const user = Number(getRouterParam(event, "user"));

  try {
    await resetFactor(user, callerOf(signed));
  } catch (error) {
    throw securityFailure(error);
  }

  setResponseStatus(event, 204);
});
