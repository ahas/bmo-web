import { wording } from "#shared/wording";

import type { FallbackChanged } from "#shared/types";

// The code the sign-in page showed, handed to the sign-in the agency holds; the agency writes the login and, for a
// new account, adds it. The code is passed on and kept nowhere.
export default defineEventHandler(async (event): Promise<FallbackChanged> => {
  await requireUserSession(event);

  const login = getRouterParam(event, "login") ?? "";
  const body = await readBody<{ code?: unknown }>(event);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (code === "") throw fail(400, wording("agents.error.login_code_needed"));

  await agencyRoute("POST", `/claude-logins/${encodeURIComponent(login)}/code`, { code }, CLAUDE_LOGIN_CALL);

  return { ok: true };
});
