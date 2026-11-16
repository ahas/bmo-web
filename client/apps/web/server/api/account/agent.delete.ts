import { wording } from "#shared/wording";

import { dropOwnBmoPicture, setOwnBmo, standingBmoOf } from "../../utils/account-service";
import { supervisorsOwnedBy } from "../../utils/axes";
import { standOwnBmos } from "../../utils/bmo-profile";
import { bmoFailure } from "../../utils/bmo-routes";
import { callerOf } from "../../utils/organization";

import type { OwnBmoView } from "#shared/bmo-profile";

// The own-BMO section's reset (docs/web.md, 「Settings」, the own-BMO section): the person's own parts and picture
// emptied, so the company's default stands for each again, then applied to their BMO.
export default defineEventHandler(async (event): Promise<OwnBmoView> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw fail(403, wording("bmo_profile.error.withheld"));

  const caller = callerOf(signed);

  try {
    await setOwnBmo(signed.id, { name: null, callNames: [], persona: null }, caller);
    await dropOwnBmoPicture(signed.id, caller);

    const [standing, owned] = await Promise.all([standingBmoOf(signed.id, caller), supervisorsOwnedBy(signed.id)]);

    standOwnBmos([signed.id]);

    return { ...standing, hasBmo: owned.length > 0 };
  } catch (error) {
    throw bmoFailure(error);
  }
});
