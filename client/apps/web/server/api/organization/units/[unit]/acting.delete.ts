import { endAppointment } from "../../../../utils/account-service";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

// The appointment running on a unit ended before its end (docs/web.md, 「System and organisation」, its chart).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    await endAppointment(unit, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }

  setResponseStatus(event, 204);
});
