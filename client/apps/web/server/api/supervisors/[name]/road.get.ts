import { requireReadableAgent } from "../../../utils/agent-reach";

import type { SupervisorRoadStateView } from "#shared/axes";

// Whether a supervisor's road can take a turn now, and why where it cannot (docs/web.md, 「Agent screen」).
export default defineEventHandler(async (event): Promise<SupervisorRoadStateView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireReadableAgent(event, name);

  return await readSupervisorRoadState(name, event);
});
