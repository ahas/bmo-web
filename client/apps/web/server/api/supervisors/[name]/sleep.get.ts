import { requireReadableAgent } from "../../../utils/agent-reach";

import type { SupervisorSleepView } from "#shared/agency";

// Whether a supervisor sleeps each night, at what hour, and when it last slept (the agency's `docs/sleep.md`, 「Its
// setting」), read for its settings dialog.
export default defineEventHandler(async (event): Promise<SupervisorSleepView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireReadableAgent(event, name);

  return await agencyRoute<SupervisorSleepView>("GET", `/supervisors/${encodeURIComponent(name)}/sleep`);
});
