import { wording } from "#shared/wording";

import { requireOwnSupervisor } from "../../utils/agent-reach";

import type { SupervisorView } from "#shared/axes";

// One supervisor's fields changed — its label, its road sent whole, its warming, compaction threshold or repository —
// for a reader who may write the supervisors tab (the agency's `docs/api.md`, 「supervisors」). Whether the values stand
// is the agency's to say, and a refused field is said under that field.
export default defineEventHandler(async (event): Promise<SupervisorView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireOwnSupervisor(event, name);

  const change = supervisorChangeOf(await readBody<unknown>(event));

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeSupervisor(name, change);
});
