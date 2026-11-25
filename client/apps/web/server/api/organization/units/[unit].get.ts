import { unitView } from "../../../utils/account-service";
import { organizationFailure, unitNumber } from "../../../utils/organization";

import type { Unit } from "@web/server-client";

// One unit read whole for the chart (docs/web.md, 「System and organisation」, its chart): its heads and members, its kind, short
// name and the unit it reports to, the roles its people carry, the people holding a post in it and the appointment
// running. The administrator's, as the chart is.
export default defineEventHandler(async (event): Promise<Unit> => {
  await requireAdministrator(event);
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitView(unit);
  } catch (error) {
    throw organizationFailure(error);
  }
});
