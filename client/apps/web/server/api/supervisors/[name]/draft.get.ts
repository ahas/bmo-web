import { requireReadableAgent } from "../../../utils/agent-reach";

import type { SupervisorDraftView } from "#shared/drafting";

// A supervisor's draft process and its questions, as the receiver holds them for that supervisor (the receiver's
// `docs/drafting.md`, 「The routes」; docs/web.md, 「Agent management screen」, the settings dialog's draft block).
export default defineEventHandler(async (event): Promise<SupervisorDraftView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireReadableAgent(event, name);

  return await readSupervisorDraft(name);
});
