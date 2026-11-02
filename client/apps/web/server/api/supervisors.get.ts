import type { SupervisorView } from "#shared/axes";

// Every supervisor in the agency's order, each with its provider order, its warming, its compaction threshold and
// what it stands on now (the agency's `docs/api.md`, 「supervisors」; docs/web.md, 「Agent management screen」).
export default defineEventHandler(async (event): Promise<SupervisorView[]> => {
  await requireUserSession(event);

  return await readSupervisors();
});
