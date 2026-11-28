import { wording } from "#shared/wording";

import { setOwnBmo } from "../../utils/account-service";
import { supervisorsOwnedBy } from "../../utils/axes";
import { standOwnBmos } from "../../utils/bmo-profile";
import { bmoFailure } from "../../utils/bmo-routes";
import { callerOf } from "../../utils/organization";

import type { OwnBmoParts, OwnBmoView } from "#shared/bmo-profile";

// The signed-in person's own name and call names for their BMO saved, then applied to it (docs/web.md,
// 「Settings」, the own-BMO section); the account service refuses a person who may not personalise their BMO.
export default defineEventHandler(async (event): Promise<OwnBmoView> => {
  const signed = await signedInUser(event);
  const body = await readBody<Partial<OwnBmoParts>>(event);

  if (signed.id === null) throw fail(403, wording("bmo_profile.error.withheld"));
  if (typeof body !== "object" || body === null || !Array.isArray(body.callNames)) throw fail(400, wording("bmo_profile.error.bad_profile"));

  const parts: OwnBmoParts = {
    name: typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : null,
    callNames: body.callNames.filter((name): name is string => typeof name === "string")
  };

  try {
    const [standing, owned] = await Promise.all([setOwnBmo(signed.id, parts, callerOf(signed)), supervisorsOwnedBy(signed.id)]);

    standOwnBmos([signed.id]);

    return { ...standing, hasBmo: owned.length > 0 };
  } catch (error) {
    throw bmoFailure(error);
  }
});
