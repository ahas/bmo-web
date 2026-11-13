import { userNode } from "../../../../utils/account-service";
import { organizationFailure } from "../../../../utils/organization";

import type { UserNode } from "@web/server-client";

// The machine a person's account is bound to and whether the hub holds it (docs/web.md, 「Organisation settings」, the
// units tab).
export default defineEventHandler(async (event): Promise<UserNode> => {
  await requireAdministrator(event);

  try {
    return await userNode(String(getRouterParam(event, "user") ?? ""));
  } catch (error) {
    throw organizationFailure(error);
  }
});
