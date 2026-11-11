import { markLeft } from "../../../../utils/account-service";
import { callerOf, organizationFailure } from "../../../../utils/organization";

// A person marked left: their account's sign-in disabled for good (docs/web.md, 「Settings」, the organisation
// section; docs/accounts.md, 「A person who leaves」).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");

  try {
    await markLeft(user, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }

  setResponseStatus(event, 204);
});
