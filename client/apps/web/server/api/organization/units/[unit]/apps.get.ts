import { appsFailure, unitApps } from "../../../../utils/apps";
import { unitNumber } from "../../../../utils/organization";

import type { UnitApp } from "#shared/apps";

// Every app the delegation chain holds as it stands for a unit, with what the reader may change of it there
// (docs/web.md, 「System and organisation」, the apps tab).
export default defineEventHandler(async (event): Promise<UnitApp[]> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitApps(unit, await signedInUser(event));
  } catch (error) {
    throw appsFailure(error);
  }
});
