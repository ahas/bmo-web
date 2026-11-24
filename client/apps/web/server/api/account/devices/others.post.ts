import { endOtherDevices } from "../../../utils/account-security";
import { profileCaller } from "../../../utils/profile";
import { browserOf, sealFreshSession, securityFailure } from "../../../utils/sign-in";

import { wording } from "#shared/wording";

// Every other device of the reader signed out; this one goes on in the fresh session the service answers for it.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await signedInUser(event);
  const session = await getUserSession(event);

  if (signed.id === null || session.sid === undefined) throw fail(404, wording("security.error.failed"));

  let fresh: string;

  try {
    fresh = await endOtherDevices(signed.id, session.sid, browserOf(event), profileCaller(signed));
  } catch (error) {
    throw securityFailure(error);
  }

  await sealFreshSession(event, fresh);

  return { ok: true };
});
