import { endDevice } from "../../../utils/account-security";
import { profileCaller } from "../../../utils/profile";
import { securityFailure } from "../../../utils/sign-in";

import { wording } from "#shared/wording";

// One of the reader's devices signed out (docs/web.md, 「Settings」, the account section's devices).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await signedInUser(event);
  const device = Number(getRouterParam(event, "device"));

  if (signed.id === null || !Number.isSafeInteger(device)) throw fail(404, wording("security.error.failed"));

  try {
    await endDevice(signed.id, device, profileCaller(signed));
  } catch (error) {
    throw securityFailure(error);
  }

  return { ok: true };
});
