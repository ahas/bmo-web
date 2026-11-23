import { adminApps, appsFailure } from "../../utils/apps";

import type { AdminApps } from "#shared/apps";

// Every app the delegation chain holds as it stands for the whole platform, and every company an offer may name
// (docs/web.md, 「Administration」, the apps tab): the administrator's.
export default defineEventHandler(async (event): Promise<AdminApps> => {
  const signed = await requireAdministrator(event);

  try {
    return await adminApps(signed);
  } catch (error) {
    throw appsFailure(error);
  }
});
