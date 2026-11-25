import { takeMemoryWrite } from "../../../../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../../../../utils/organization";
import { MEMORY_WRITER_CODES } from "../../../../../utils/org-memory";

// A person's grant of a unit's org memory write taken away (docs/web.md, 「System and organisation」, the org memory tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const user = String(unitNumber(getRouterParam(event, "user")));

  try {
    await takeMemoryWrite(unit, user, callerOf(signed));

    return null;
  } catch (error) {
    throw organizationFailure(error, MEMORY_WRITER_CODES);
  }
});
