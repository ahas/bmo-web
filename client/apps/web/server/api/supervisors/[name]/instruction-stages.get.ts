import { requireReadableAgent } from "../../../utils/agent-reach";

import type { SupervisorStagesView } from "#shared/instruction-stages";

// A supervisor's instruction stages, the chain it follows and its catalogue's texts, as the receiver holds them for
// that supervisor (the receiver's `docs/instruction.md`, 「The routes」; docs/web.md, 「Agent management screen」, the
// settings dialog's draft block).
export default defineEventHandler(async (event): Promise<SupervisorStagesView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireReadableAgent(event, name);

  return await readSupervisorStages(name);
});
