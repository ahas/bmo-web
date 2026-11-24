import { testSystemMail } from "../../../utils/account-security";
import { callerOf } from "../../../utils/organization";
import { securityFailure } from "../../../utils/sign-in";

// One test mail sent through the system mail, the administrator's alone (docs/web.md, 「Administration」, the mail tab).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<{ to?: unknown }>(event).catch(() => null);

  try {
    await testSystemMail(typeof body?.to === "string" ? body.to.trim() : "", callerOf(await signedInUser(event)));
  } catch (error) {
    throw securityFailure(error);
  }

  return { ok: true };
});
