import { wording } from "#shared/wording";

import type { RoleAgentView } from "#shared/axes";

// The fallback road of an agent at a position moved to another (the agency's `docs/role-agents.md`, 「An agent's
// fallback roads」).
export default defineEventHandler(async (event): Promise<RoleAgentView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));
  const position = Number(getRouterParam(event, "position"));
  const body = await readBody<unknown>(event);
  const to = body !== null && typeof body === "object" ? (body as { to?: unknown }).to : undefined;

  if (!Number.isInteger(position) || position < 0 || typeof to !== "number" || !Number.isInteger(to) || to < 0) throw fail(400, wording("common.error.bad_action"));

  return await moveRoleAgentFallback(name, position, to, event);
});
