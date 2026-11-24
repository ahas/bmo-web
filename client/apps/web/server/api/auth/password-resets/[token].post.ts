import { setPasswordByLink } from "../../../utils/account-security";
import { securityFailure } from "../../../utils/sign-in";

import { wording } from "#shared/wording";

// A new password set by a reset link, every session of the account ending (docs/web.md, 「Pages with no sign-in」).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const token = String(getRouterParam(event, "token") ?? "");
  const body = await readBody<{ password?: unknown }>(event).catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) throw fail(400, wording("security.error.weak_password"));

  try {
    await setPasswordByLink(token, password);
  } catch (error) {
    throw securityFailure(error);
  }

  return { ok: true };
});
