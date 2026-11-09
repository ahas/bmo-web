import { wording } from "#shared/wording";

import type { RoleAgentView } from "#shared/axes";

// One agent's fields changed, the rest kept; a field sent as null is cleared, which for what it lays over its role
// gives the role's own back (the agency's `docs/role-agents.md`, 「Changing the agents」).
export default defineEventHandler(async (event): Promise<RoleAgentView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));
  const change = roleAgentChangeOf(await readBody<unknown>(event), false);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeRoleAgent(name, change);
});
