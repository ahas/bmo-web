import { appParam, appsFailure, recallUnitApp } from "../../../../../../utils/apps";
import { unitNumber } from "../../../../../../utils/organization";

// A company's own shared app recalled at a unit, through the agency, which judges who heads it (docs/web.md,
// 「System and organisation」, the apps tab).
export default defineEventHandler(async (event): Promise<null> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const app = appParam(getRouterParam(event, "app"));

  try {
    await recallUnitApp(unit, app, await signedInUser(event));

    return null;
  } catch (error) {
    throw appsFailure(error);
  }
});
