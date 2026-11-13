import { changeUnit } from "../../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../../utils/organization";

import type { Unit } from "@web/server-client";

// A unit renamed, or moved under another parent of its company (docs/web.md, 「Organisation settings」, the units tab).
export default defineEventHandler(async (event): Promise<Unit> => {
  const signed = await requireAdministrator(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ name?: unknown; parent?: unknown }>(event);
  const change = {
    ...(typeof body?.name === "string" ? { name: body.name } : {}),
    ...(body?.parent === undefined || body.parent === null ? {} : { parent: unitNumber(body.parent) })
  };

  try {
    return await changeUnit(unit, change, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }
});
