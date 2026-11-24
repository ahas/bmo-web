import { confirmFactor } from "../../../utils/account-security";
import { profileCaller } from "../../../utils/profile";
import { securityFailure } from "../../../utils/sign-in";

import { wording } from "#shared/wording";

// The reader's waiting second factor confirmed with a code: its ten recovery codes, shown once.
export default defineEventHandler(async (event): Promise<{ codes: string[] }> => {
  const signed = await signedInUser(event);
  const body = await readBody<{ code?: unknown }>(event).catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (signed.id === null) throw fail(404, wording("security.error.failed"));
  if (code === "") throw fail(401, wording("security.error.wrong_code"));

  try {
    return { codes: await confirmFactor(signed.id, code, profileCaller(signed)) };
  } catch (error) {
    throw securityFailure(error);
  }
});
