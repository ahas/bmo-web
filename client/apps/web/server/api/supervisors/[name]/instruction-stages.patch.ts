import { wording } from "#shared/wording";

import { requireOwnSupervisor } from "../../../utils/agent-reach";

import type { SupervisorStagesView } from "#shared/instruction-stages";

// One save of a supervisor's instruction stages: the texts set, its chain set or taken away, and the texts taken away
// (the receiver's `docs/instruction.md`, 「The routes」). Whether the values stand is the receiver's to say; a body of
// the wrong shape goes no further. A part the save leaves out is left as it stands.
export default defineEventHandler(async (event): Promise<SupervisorStagesView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireOwnSupervisor(event, name);

  const save = stagesSaveOf(await readBody<Record<string, unknown>>(event));

  if (save === null) throw fail(400, wording("common.error.bad_action"));

  return await writeSupervisorStages(name, save);
});
