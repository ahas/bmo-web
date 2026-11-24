import { freshCodes } from "../../utils/account-security";
import { profileCaller } from "../../utils/profile";
import { securityFailure } from "../../utils/sign-in";

import { wording } from "#shared/wording";

// Ten new recovery codes for the reader's second factor, in place of the old, shown once.
export default defineEventHandler(async (event): Promise<{ codes: string[] }> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw fail(404, wording("security.error.failed"));

  try {
    return { codes: await freshCodes(signed.id, profileCaller(signed)) };
  } catch (error) {
    throw securityFailure(error);
  }
});
