import { wording } from "#shared/wording";

import { unitNumber } from "../../../../../utils/organization";
import { removeUnitRepository } from "../../../../../utils/organisation-agents";
import { orgAgentsFailure } from "../../../../../utils/organisation-supply";

// A repository of a unit's removed, in the reader's name (docs/web.md, 「Organisation」, the agents tab).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const name = getRouterParam(event, "name");

  if (name === undefined || name === "") throw fail(400, wording("organization.error.bad_request"));

  try {
    await removeUnitRepository(event, unit, decodeURIComponent(name), await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
