import { signedInUser } from "../../../../../../utils/accounts";
import { unitNumber } from "../../../../../../utils/organization";
import { compositionModels, orgAgentsFailure } from "../../../../../../utils/organisation-supply";

import type { OwnModel } from "#shared/own-agents";

// The models a road of a unit's sign-up composition may name on one provider (docs/web.md, 「System and organisation」, the agents
// tab), for a reader who reads the unit's composition.
export default defineEventHandler(async (event): Promise<OwnModel[]> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await compositionModels(unit, getRouterParam(event, "provider") ?? "", await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
