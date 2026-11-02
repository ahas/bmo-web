import type { SupervisorView } from "#shared/axes";

// One supervisor as the agency answers it (the agency's `docs/api.md`, 「supervisors」).
export default defineEventHandler(async (event): Promise<SupervisorView> => {
  await requireUserSession(event);

  return await readSupervisor(axisName(getRouterParam(event, "name")));
});
