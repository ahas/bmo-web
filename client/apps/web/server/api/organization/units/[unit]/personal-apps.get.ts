import { unitNumber } from "../../../../utils/organization";
import { orgAgentsFailure } from "../../../../utils/organisation-supply";
import { personalAppSettings } from "../../../../utils/personal-apps-settings";

import type { PersonalAppSettings } from "#shared/personal-apps-settings";

// A unit's personal app settings as the reader stands to them (docs/web.md, 「System and organisation」, the apps tab); `company`
// says the unit is a company, where the administrator reads the platform's rules for it.
export default defineEventHandler(async (event): Promise<PersonalAppSettings> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await personalAppSettings({ unit }, getQuery(event).company === "true", await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
