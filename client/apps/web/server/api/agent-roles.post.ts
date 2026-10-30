import { wording } from "#shared/wording";

import type { AgentRoleView } from "#shared/agency";

// A new role: its name, label and bundles, and the bound, prompt and tier where they are given (the agency's
// `docs/agent-roles.md`). Whether the name, the bundles and the tier stand is the agency's to say, and a refusal
// names its field; a body of another shape goes no further.
export default defineEventHandler(async (event): Promise<AgentRoleView> => {
  await requireUserSession(event);

  const change = agentRoleChangeOf(await readBody<unknown>(event), true);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await addAgentRole(change);
});
