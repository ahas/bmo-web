import { linkAgentSettings } from "../../../utils/organisation-agents";
import { orgAgentsFailure } from "../../../utils/organisation-supply";

import type { UnitAgentSettings } from "#shared/organisation-agents";

// The platform's own link of the agent settings (docs/web.md, 「System and organisation」, the agents tab with the platform
// chosen): what every company stands on where it sets none. The administrator's.
export default defineEventHandler(async (event): Promise<UnitAgentSettings> => {
  const signed = await requireAdministrator(event);

  try {
    return await linkAgentSettings("platform", signed);
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
