import type { RoleSessionPage } from "#shared/axes";

// One page of the sessions a role's runs opened, newest first, the page before the session `before` names (the
// agency's `docs/api.md`, 「roles」; its `docs/sessions.md`, 「The session history of a role」).
const PAGE = 20;

export default defineEventHandler(async (event): Promise<RoleSessionPage> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));
  const before = Number(getQuery(event).before);

  return await readRoleSessions(name, Number.isSafeInteger(before) && before > 0 ? before : null, PAGE);
});
