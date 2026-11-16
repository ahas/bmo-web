import { wording } from "#shared/wording";

import { setOwnBmoPicture } from "../../../utils/account-service";
import { standOwnBmos } from "../../../utils/bmo-profile";
import { bmoFailure, pictureForm } from "../../../utils/bmo-routes";
import { callerOf } from "../../../utils/organization";

// The signed-in person's own picture for their BMO set from the form, then applied to it (docs/web.md, 「Settings」,
// the own-BMO section).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw fail(403, wording("bmo_profile.error.withheld"));

  const picture = await pictureForm(event);

  try {
    await setOwnBmoPicture(signed.id, picture, callerOf(signed));
    standOwnBmos([signed.id]);

    return null;
  } catch (error) {
    throw bmoFailure(error);
  }
});
