import { wording } from "#shared/wording";

import { unitNumber } from "../../../../../../utils/organization";
import { orgAgentsFailure, switchKey } from "../../../../../../utils/organisation-supply";

// One of the unit's keys turned on or off (docs/web.md, 「Organisation」, the supply tab): `enabled`.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const item = String(getRouterParam(event, "item") ?? "");
  const body = await readBody<{ enabled?: unknown }>(event).catch(() => ({}) as { enabled?: unknown });

  if (typeof body?.enabled !== "boolean" || item === "") throw fail(400, wording("organization.error.bad_request"));

  try {
    await switchKey(event, unit, item, body.enabled);
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
