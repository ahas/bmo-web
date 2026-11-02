import type { SupervisorRoomView } from "#shared/axes";

// The rooms a supervisor's turns went into, each with its latest run there (the agency's `docs/api.md`, 「supervisors」).
export default defineEventHandler(async (event): Promise<SupervisorRoomView[]> => {
  await requireUserSession(event);

  return await readSupervisorRooms(axisName(getRouterParam(event, "name")));
});
