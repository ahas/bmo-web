import type { SupervisorView } from "#shared/axes";

// Every supervisor in the agency's order, each with its road, its warming and its compaction threshold (the agency's
// `docs/api.md`, 「supervisors」; docs/web.md, 「Agent management screen」).
export default defineEventHandler(async (event): Promise<SupervisorView[]> => {
  await requireUserSession(event);

  return await readSupervisors();
});
