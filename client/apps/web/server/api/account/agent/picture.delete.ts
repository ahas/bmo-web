import { wording } from "#shared/wording";

import { dropOwnBmoPicture } from "../../../utils/account-service";
import { standOwnBmos } from "../../../utils/bmo-profile";
import { bmoFailure } from "../../../utils/bmo-routes";
import { callerOf } from "../../../utils/organization";

// The signed-in person's own picture for their BMO taken away, so the company's stands again (docs/web.md,
// 「Settings」, the own-BMO section).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw fail(403, wording("bmo_profile.error.withheld"));

  try {
    await dropOwnBmoPicture(signed.id, callerOf(signed));
    standOwnBmos([signed.id]);

    return null;
  } catch (error) {
    throw bmoFailure(error);
  }
});
