import type { ResearchSupervisorView } from "#shared/axes";

// The supervisor a search or browse run no supervisor delegated writes its brain for, as the agency's own settings
// hold it (docs/web.md, 「Settings」, the research section).
export default defineEventHandler(async (event): Promise<ResearchSupervisorView> => {
  await requireAdministrator(event);

  const settings = await agencyCall(agency().GET("/settings"));

  return { supervisor: settings.researchSupervisor };
});
