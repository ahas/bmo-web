import { factorOff } from "../../../utils/account-security";
import { profileCaller } from "../../../utils/profile";
import { securityFailure } from "../../../utils/sign-in";

import { wording } from "#shared/wording";

// The reader's second factor turned off with their password; refused where their organisation asks for it.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await signedInUser(event);
  const body = await readBody<{ password?: unknown }>(event).catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (signed.id === null) throw fail(404, wording("security.error.failed"));
  if (password === "") throw fail(401, wording("security.error.wrong_password"));

  try {
    await factorOff(signed.id, password, profileCaller(signed));
  } catch (error) {
    throw securityFailure(error);
  }

  return { ok: true };
});
