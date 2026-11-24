import { orgAgentsFailure } from "../../../utils/organisation-supply";
import { personalAppSettings } from "../../../utils/personal-apps-settings";

import type { PersonalAppSettings } from "#shared/personal-apps-settings";

// The platform's own link of the personal app settings (docs/web.md, 「Organisation」, the apps tab with the platform
// chosen): the administrator's.
export default defineEventHandler(async (event): Promise<PersonalAppSettings> => {
  const signed = await requireAdministrator(event);

  try {
    return await personalAppSettings("platform", false, signed);
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
