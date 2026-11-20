import { grantMemoryWrite } from "../../../../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../../../../utils/organization";
import { MEMORY_WRITER_CODES } from "../../../../../utils/org-memory";

// A person granted a unit's org memory write, by the administrator or a head of the unit (docs/web.md, 「Organisation」,
// the org memory tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const user = String(unitNumber(getRouterParam(event, "user")));

  try {
    await grantMemoryWrite(unit, user, callerOf(signed));

    return null;
  } catch (error) {
    throw organizationFailure(error, MEMORY_WRITER_CODES);
  }
});
