import { setSystemMail } from "../../utils/account-security";
import { callerOf } from "../../utils/organization";
import { securityFailure } from "../../utils/sign-in";

import type { SystemMail } from "@web/server-client";

// The system mail written whole: bmo-mail's outgoing server, the sender and the name of its sign-in secret, the
// administrator's alone (docs/web.md, 「Administration」, the mail tab).
export default defineEventHandler(async (event): Promise<SystemMail> => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}) as Record<string, unknown>);
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const named = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

  try {
    return await setSystemMail(
      { server: named(body.server), from: text(body.from), fromName: text(body.fromName), secret: named(body.secret) },
      callerOf(await signedInUser(event))
    );
  } catch (error) {
    throw securityFailure(error);
  }
});
