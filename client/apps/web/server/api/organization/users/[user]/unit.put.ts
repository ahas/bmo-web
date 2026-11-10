import { placeUser } from "../../../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

import type { UserUnit } from "@web/server-client";

// A user placed in a unit (docs/web.md, 「Settings」, the organisation section).
export default defineEventHandler(async (event): Promise<UserUnit> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");
  const body = await readBody<{ unit?: unknown }>(event);
  const unit = unitNumber(body?.unit);

  try {
    return await placeUser(user, unit, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }
});
