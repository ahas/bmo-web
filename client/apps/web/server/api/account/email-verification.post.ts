import { mailVerification } from "../../utils/account-security";
import { profileCaller } from "../../utils/profile";
import { linkBase, securityFailure } from "../../utils/sign-in";

import { wording } from "#shared/wording";

// The reader's own email sent its verification link (docs/accounts.md, 「A verified email」).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await signedInUser(event);
  const base = linkBase(event, true);

  if (signed.id === null || base === null) throw fail(404, wording("security.error.failed"));

  try {
    await mailVerification(signed.id, base, profileCaller(signed));
  } catch (error) {
    throw securityFailure(error);
  }

  return { ok: true };
});
