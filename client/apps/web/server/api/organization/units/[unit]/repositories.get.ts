import { unitNumber } from "../../../../utils/organization";
import { unitRepositories } from "../../../../utils/organisation-agents";
import { orgAgentsFailure } from "../../../../utils/organisation-supply";

import type { UnitRepository } from "#shared/organisation-agents";

// The repositories a unit owns, for its heads and the administrator (docs/web.md, 「Organisation」, the agents tab).
export default defineEventHandler(async (event): Promise<UnitRepository[]> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitRepositories(unit, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
