import { orgAgentsFailure } from "../../../../../../../utils/organisation-supply";
import { unitNumber } from "../../../../../../../utils/organization";
import { unitRepositoryModels } from "../../../../../../../utils/unit-repositories";

import type { ProviderModelsView } from "#shared/axes";

// The models a pinned model of a unit's repository may name on one provider (docs/web.md, 「System and organisation」, the agents
// tab).
export default defineEventHandler(async (event): Promise<ProviderModelsView> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitRepositoryModels(unit, axisName(getRouterParam(event, "name")), axisName(getRouterParam(event, "provider")), await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
