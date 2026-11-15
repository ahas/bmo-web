// A sign-in given up: the agency ends the CLI it holds, and an account not yet added is not added.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const login = getRouterParam(event, "login") ?? "";

  await agencyRoute("DELETE", `/claude-logins/${encodeURIComponent(login)}`, undefined, CLAUDE_LOGIN_CALL);

  return { ok: true };
});
