import { setHead } from "../../../../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../../../../utils/organization";

// A user's head grant on a unit taken away (docs/web.md, 「Organisation settings」, the units tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const user = String(getRouterParam(event, "user") ?? "");

  try {
    await setHead(unit, user, false, callerOf(signed));
    setResponseStatus(event, 204);

    return null;
  } catch (error) {
    throw organizationFailure(error);
  }
});
