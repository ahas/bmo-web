import { wording } from "#shared/wording";

// One role removed. The agency refuses a role an agent holds or a kind's own, said in the pack's words.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name") ?? "";

  if (name === "") throw fail(400, wording("common.error.bad_action"));

  await removeAgentRole(name);

  return { ok: true };
});
