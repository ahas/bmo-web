import { unitNumber } from "../../../../utils/organization";
import { unitAgentSettings } from "../../../../utils/organisation-agents";
import { orgAgentsFailure } from "../../../../utils/organisation-supply";

import type { UnitAgentSettings } from "#shared/organisation-agents";

// A unit's agent settings on the delegation chain as the reader stands to them: its instructions, its persona's choice
// and repository management (docs/web.md, 「Organisation」, the agents tab).
export default defineEventHandler(async (event): Promise<UnitAgentSettings> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitAgentSettings(unit, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
