import type { SupervisorDraftView } from "#shared/drafting";

// A supervisor's draft process and its questions, as the receiver holds them for that supervisor (the receiver's
// `docs/drafting.md`, 「The routes」; docs/web.md, 「Agent management screen」, the settings dialog's draft block).
export default defineEventHandler(async (event): Promise<SupervisorDraftView> => {
  await requireUserSession(event);

  return await readSupervisorDraft(axisName(getRouterParam(event, "name")));
});
