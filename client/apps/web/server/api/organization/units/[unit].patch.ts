import { changeUnit } from "../../../utils/account-service";
import { callerOf, organizationFailure, unitNumber } from "../../../utils/organization";

import type { Unit } from "@web/server-client";

// A unit renamed, moved under another parent of its company, or given its kind, short name and the unit it reports to
// (docs/web.md, 「Organisation」, its chart): each of the last three left as it stands where the body leaves it out and
// taken away where it names null.
export default defineEventHandler(async (event): Promise<Unit> => {
  const signed = await requireAdministrator(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ name?: unknown; parent?: unknown; kind?: unknown; shortName?: unknown; reportsTo?: unknown }>(event);
  const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
  const change = {
    ...(typeof body?.name === "string" ? { name: body.name } : {}),
    ...(body?.parent === undefined || body.parent === null ? {} : { parent: unitNumber(body.parent) }),
    ...(body?.kind === undefined ? {} : { kind: text(body.kind) }),
    ...(body?.shortName === undefined ? {} : { shortName: text(body.shortName) }),
    ...(body?.reportsTo === undefined ? {} : { reportsTo: body.reportsTo === null ? null : unitNumber(body.reportsTo) })
  };

  try {
    return await changeUnit(unit, change, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error);
  }
});
