import { appsFailure, platformApps } from "../../../utils/apps";

import type { PlatformApp } from "#shared/apps";

// Every app the delegation chain holds as it stands at the platform's own link (docs/web.md, 「System and organisation」, the
// apps tab with the platform chosen): the administrator's.
export default defineEventHandler(async (event): Promise<PlatformApp[]> => {
  const signed = await requireAdministrator(event);

  try {
    return await platformApps(signed);
  } catch (error) {
    throw appsFailure(error);
  }
});
