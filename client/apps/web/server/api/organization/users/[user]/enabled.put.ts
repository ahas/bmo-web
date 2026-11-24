import { setEnabled } from "../../../../utils/account-security";
import { callerOf } from "../../../../utils/organization";
import { securityFailure } from "../../../../utils/sign-in";

import { wording } from "#shared/wording";

// A person's account disabled or enabled by the administrator (docs/web.md, 「Organisation」, the people tab).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const user = Number(getRouterParam(event, "user"));
  const body = await readBody<{ enabled?: unknown }>(event).catch(() => null);

  if (typeof body?.enabled !== "boolean") throw fail(400, wording("organization.error.bad_request"));

  try {
    await setEnabled(user, body.enabled, callerOf(signed));
  } catch (error) {
    throw securityFailure(error);
  }

  setResponseStatus(event, 204);
});
