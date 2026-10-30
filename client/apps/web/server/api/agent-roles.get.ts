import type { AgentRolesView } from "#shared/agency";

// Every role the agency holds, in its order, with every bundle a role may give (the agency's
// `docs/agent-roles.md`), as the roles tab reads them.
export default defineEventHandler(async (event): Promise<AgentRolesView> => {
  await requireUserSession(event);

  return await agentRoles();
});
