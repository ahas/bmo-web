import { requireReadableAgent } from "../../../utils/agent-reach";

import type { SupervisorRoomView } from "#shared/axes";

// The rooms a supervisor's turns went into, each with its latest run there (the agency's `docs/api.md`, 「supervisors」).
export default defineEventHandler(async (event): Promise<SupervisorRoomView[]> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireReadableAgent(event, name);

  return await readSupervisorRooms(name);
});
