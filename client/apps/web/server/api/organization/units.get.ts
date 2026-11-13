import { listUnits } from "../../utils/account-service";
import { callerOf, organizationFailure } from "../../utils/organization";

import type { UnitRow } from "@web/server-client";

// Every unit, companies first and each unit after its parent (docs/web.md, 「Organisation settings」, the units tab):
// the administrator's.
export default defineEventHandler(async (event): Promise<UnitRow[]> => {
  const signed = await requireAdministrator(event);

  try {
    return await listUnits(callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }
});
