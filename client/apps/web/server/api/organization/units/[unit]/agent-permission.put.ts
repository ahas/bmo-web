import { wording } from "#shared/wording";

import { setUnitPermission } from "../../../../utils/account-service";
import { standOwnBmos } from "../../../../utils/bmo-profile";
import { bmoFailure, idParam, peopleUnder } from "../../../../utils/bmo-routes";
import { callerOf } from "../../../../utils/organization";

import type { PermissionSetting } from "#shared/bmo-profile";

const SETTINGS: readonly PermissionSetting[] = ["allow", "deny", "inherit"];

// The personalisation setting on a unit, for the administrator and a head of the unit, then applied to the BMO of every
// person under it (docs/web.md, 「Organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const unit = idParam(event, "unit");
  const body = await readBody<{ setting?: unknown }>(event);
  const setting = SETTINGS.find((one) => one === body?.setting);

  if (setting === undefined) throw fail(400, wording("common.error.bad_action"));

  try {
    await setUnitPermission(unit, setting, callerOf(signed));
    standOwnBmos(await peopleUnder(unit));

    return null;
  } catch (error) {
    throw bmoFailure(error);
  }
});
