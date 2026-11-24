import { enrolFactor } from "../../utils/account-security";
import { profileCaller } from "../../utils/profile";
import { securityFailure } from "../../utils/sign-in";

import { wording } from "#shared/wording";

import type { Enrolment } from "@web/server-client";

// A second factor of the reader's own made to be confirmed: its secret, its otpauth address and its QR code, drawn by
// the account service itself (docs/accounts.md, 「The second factor」).
export default defineEventHandler(async (event): Promise<Enrolment> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw fail(404, wording("security.error.failed"));

  try {
    return await enrolFactor(signed.id, profileCaller(signed));
  } catch (error) {
    throw securityFailure(error);
  }
});
