import { standingBmoOf } from "../../utils/account-service";
import { supervisorsOwnedBy } from "../../utils/axes";
import { bmoFailure } from "../../utils/bmo-routes";
import { callerOf } from "../../utils/organization";

import type { OwnBmoView } from "#shared/bmo-profile";

// The profile standing for the signed-in person's own BMO, whether they may personalise it and whether they own one
// (docs/web.md, 「Settings」, the own-BMO section).
export default defineEventHandler(async (event): Promise<OwnBmoView> => {
  const signed = await signedInUser(event);

  if (signed.id === null) throw bmoFailure(new Error("no user"));

  try {
    const [standing, owned] = await Promise.all([standingBmoOf(signed.id, callerOf(signed)), supervisorsOwnedBy(signed.id)]);

    return { ...standing, hasBmo: owned.length > 0 };
  } catch (error) {
    throw bmoFailure(error);
  }
});
