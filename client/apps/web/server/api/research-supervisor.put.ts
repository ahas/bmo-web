import { wording } from "#shared/wording";

import type { ResearchSupervisorView } from "#shared/axes";

// The research supervisor chosen (the agency's `docs/api.md`, 「settings」): a supervisor's name, or null for none. The
// answer is the setting as the agency then holds it.
export default defineEventHandler(async (event): Promise<ResearchSupervisorView> => {
  await requireAdministrator(event);

  const body = await readBody<{ supervisor?: unknown }>(event);
  const supervisor = body?.supervisor;

  if (supervisor !== null && (typeof supervisor !== "string" || supervisor === "")) throw fail(400, wording("common.error.bad_action"));

  const settings = await agencyCall(agency().PATCH("/settings", { body: { researchSupervisor: supervisor } }));

  return { supervisor: settings.researchSupervisor };
});
