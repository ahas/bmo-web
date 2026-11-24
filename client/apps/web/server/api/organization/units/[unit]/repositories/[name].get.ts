import { orgAgentsFailure } from "../../../../../utils/organisation-supply";
import { unitNumber } from "../../../../../utils/organization";
import { unitRepositoryDetail } from "../../../../../utils/unit-repositories";

import type { UnitRepositoryDetail } from "#shared/axes";

// A unit's repository whole, with what its dialog's choices offer (docs/web.md, 「Organisation」, the agents tab).
export default defineEventHandler(async (event): Promise<UnitRepositoryDetail> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitRepositoryDetail(unit, axisName(getRouterParam(event, "name")), await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
