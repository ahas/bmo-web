import { sectionsOf } from "../../../utils/account-service";
import { signedInUser } from "../../../utils/accounts";
import { ownerKeyOf, ownerRoleOf } from "../../../utils/owner-key";

import type { SectionRow } from "#shared/sections";

// One user's console sections, for the administrator's screen or for the login they are (docs/web.md, 「Access」).
// The account service decides which callers may read them.
export default defineEventHandler(async (event): Promise<SectionRow[]> => {
  const signed = await signedInUser(event);
  const user = getRouterParam(event, "user") ?? "";

  return await sectionsOf(user, { key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) });
});
