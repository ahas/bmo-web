import { makeUnit } from "../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../utils/organization";

import type { Unit } from "@web/server-client";

// A unit made under a parent, or a new company where none is named (docs/web.md, 「Organisation settings」, the units
// tab).
export default defineEventHandler(async (event): Promise<Unit> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<{ name?: unknown; parent?: unknown }>(event);
  const name = typeof body?.name === "string" ? body.name : "";
  const parent = body?.parent === undefined || body.parent === null ? null : unitNumber(body.parent);

  try {
    return await makeUnit(name, parent, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }
});
