import { wording } from "#shared/wording";

import { unitNumber } from "../../../../../../utils/organization";
import { orgAgentsFailure, removeKey } from "../../../../../../utils/organisation-supply";

// One of the unit's keys taken away (docs/web.md, 「Organisation」, the supply tab); its secret stays in the unit's
// space.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const item = String(getRouterParam(event, "item") ?? "");

  if (item === "") throw fail(400, wording("organization.error.bad_request"));

  try {
    await removeKey(event, unit, item);
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
