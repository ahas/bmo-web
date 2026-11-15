import { requireReadableAgent } from "../../utils/agent-reach";

import type { SupervisorView } from "#shared/axes";

// One supervisor as the agency answers it (the agency's `docs/api.md`, 「supervisors」).
export default defineEventHandler(async (event): Promise<SupervisorView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireReadableAgent(event, name);

  return await readSupervisor(name);
});
