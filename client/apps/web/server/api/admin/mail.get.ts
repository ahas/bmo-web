import { systemMail } from "../../utils/account-security";
import { callerOf } from "../../utils/organization";
import { securityFailure } from "../../utils/sign-in";

import type { SystemMail } from "@web/server-client";

// The system mail as set, with bmo-mail's outgoing servers, the administrator's alone (docs/web.md, 「Administration」,
// the mail tab).
export default defineEventHandler(async (event): Promise<SystemMail> => {
  try {
    return await systemMail(callerOf(await signedInUser(event)));
  } catch (error) {
    throw securityFailure(error);
  }
});
