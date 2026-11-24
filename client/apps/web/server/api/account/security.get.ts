import { accountSecurity, devicesOf, triesOf } from "../../utils/account-security";
import { profileCaller } from "../../utils/profile";
import { securityFailure } from "../../utils/sign-in";

import { wording } from "#shared/wording";

import type { OwnSecurity } from "#shared/account-security";

// What stands of the reader's own account's security (docs/web.md, 「Settings」, 계정's 보안): its email and second
// factor, its devices with this one marked, and its newest tries.
export default defineEventHandler(async (event): Promise<OwnSecurity> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw fail(404, wording("security.error.failed"));

  const session = await getUserSession(event);
  const caller = profileCaller(signed);

  try {
    const [security, devices, tries] = await Promise.all([
      accountSecurity(signed.id, caller),
      devicesOf(signed.id, session.sid ?? null, caller),
      triesOf(signed.id, caller)
    ]);

    return { security, devices: devices.devices, tries: tries.tries.slice(0, 20) };
  } catch (error) {
    throw securityFailure(error);
  }
});
