import { wording } from "#shared/wording";

import type { RoleAgentView } from "#shared/axes";

// The fallback road of an agent at a position removed (the agency's `docs/role-agents.md`, 「An agent's fallback
// roads」).
export default defineEventHandler(async (event): Promise<RoleAgentView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));
  const position = Number(getRouterParam(event, "position"));

  if (!Number.isInteger(position) || position < 0) throw fail(400, wording("common.error.bad_action"));

  return await removeRoleAgentFallback(name, position, event);
});
