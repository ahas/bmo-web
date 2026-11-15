import { secretSettingsOf } from "../utils/secret-settings";

import type { SecretSettingsView } from "#shared/secret-settings";

// The secret each of the agency's secret settings names (docs/web.md, 「Administration」, the providers tab),
// as the agency's own settings hold them.
export default defineEventHandler(async (event): Promise<SecretSettingsView> => {
  await requireAdministrator(event);

  return secretSettingsOf(await agencyCall(agency().GET("/settings")));
});
