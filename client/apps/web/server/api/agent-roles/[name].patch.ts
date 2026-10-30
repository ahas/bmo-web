import { wording } from "#shared/wording";

import type { AgentRoleView } from "#shared/agency";

// One role's change, the fields the body names and no other, a cleared bound, prompt or tier sent as null (the
// agency's `docs/agent-roles.md`). A body that names no field of its shape goes no further.
export default defineEventHandler(async (event): Promise<AgentRoleView> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name") ?? "";
  const change = agentRoleChangeOf(await readBody<unknown>(event), false);

  if (name === "" || change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeAgentRole(name, change);
});
