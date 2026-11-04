import { listUsers } from "../../utils/account-service";
import { ownerKeyOf, ownerRoleOf } from "../../utils/owner-key";

import type { UserSummary } from "@web/server-client";

// Every user, for the administrator's screen that sets one person's sections (docs/web.md, 「Access」). The
// account service holds the list and refuses any login but the administrator's.
export default defineEventHandler(async (event): Promise<UserSummary[]> => {
  const signed = await requireAdministrator(event);

  return await listUsers({ key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) });
});
