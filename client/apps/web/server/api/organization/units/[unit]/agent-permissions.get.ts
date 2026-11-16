import { permissionTreeOf } from "../../../../utils/account-service";
import { bmoFailure, idParam } from "../../../../utils/bmo-routes";
import { callerOf } from "../../../../utils/organization";

import type { PermissionTree } from "#shared/bmo-profile";

// Who under a unit may personalise their BMO: the unit and every unit below it, and every person standing in one, each
// with its setting and what it resolves to (docs/web.md, 「Organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<PermissionTree> => {
  const signed = await signedInUser(event);
  const unit = idParam(event, "unit");

  try {
    return await permissionTreeOf(unit, callerOf(signed));
  } catch (error) {
    throw bmoFailure(error);
  }
});
