import type { CompanionView } from "#shared/agency";

// Every companion as the agency answers it (the agency's `docs/api.md`, 「companions」), whole: its model, its settings,
// its prompt's pieces and its room sessions.
export default defineEventHandler(async (event): Promise<CompanionView[]> => {
  await requireUserSession(event);

  const page = await agencyCall(agency().GET("/companions"));

  return page.items.map(companionViewOf);
});
