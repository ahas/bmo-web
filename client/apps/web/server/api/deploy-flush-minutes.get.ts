import { deployFlushOf } from "../utils/deploy-flush";

import type { DeployFlushView } from "#shared/deploy-flush";

// The minutes between two of the agency's flushes of the deploy queue (docs/web.md, 「Administration」, the providers
// tab), as the agency's own settings answer them: the minutes in force.
export default defineEventHandler(async (event): Promise<DeployFlushView> => {
  await requireAdministrator(event);

  return deployFlushOf(await agencyCall(agency().GET("/settings")));
});
