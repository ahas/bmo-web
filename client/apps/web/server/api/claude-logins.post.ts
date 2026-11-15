import { wording } from "#shared/wording";

import type { ClaudeLoginStarted } from "#shared/types";

interface StartBody {
  account?: unknown;
  name?: unknown;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

// A Claude account's sign-in started: an account there signed in again by its id, or a new one by its name, one of the
// two. The answer is the sign-in's identifier and the address the administrator approves it at in their own browser.
export default defineEventHandler(async (event): Promise<ClaudeLoginStarted> => {
  await requireUserSession(event);

  const body = await readBody<StartBody>(event);
  const account = text(body?.account);
  const name = text(body?.name);

  if ((account === null) === (name === null)) throw fail(400, wording("agents.error.login_which"));

  setResponseStatus(event, 201);

  return await agencyRoute<ClaudeLoginStarted>("POST", "/claude-logins", account === null ? { name } : { account }, CLAUDE_LOGIN_CALL);
});
