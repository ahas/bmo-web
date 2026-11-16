import { wording } from "#shared/wording";

import { setUserPermission } from "../../../../utils/account-service";
import { standOwnBmos } from "../../../../utils/bmo-profile";
import { bmoFailure, idParam } from "../../../../utils/bmo-routes";
import { callerOf } from "../../../../utils/organization";

import type { PermissionSetting } from "#shared/bmo-profile";

const SETTINGS: readonly PermissionSetting[] = ["allow", "deny", "inherit"];

// The personalisation setting on one person, for the administrator and a head of the person's unit, then applied to
// their BMO (docs/web.md, 「Organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const user = idParam(event, "user");
  const body = await readBody<{ setting?: unknown }>(event);
  const setting = SETTINGS.find((one) => one === body?.setting);

  if (setting === undefined) throw fail(400, wording("common.error.bad_action"));

  try {
    await setUserPermission(user, setting, callerOf(signed));
    standOwnBmos([user]);

    return null;
  } catch (error) {
    throw bmoFailure(error);
  }
});
