import { sectionsOf } from "../../../utils/account-service";
import { signedInUser } from "../../../utils/accounts";
import { ownerKeyOf, ownerRoleOf } from "../../../utils/owner-key";

import type { SectionRow } from "#shared/sections";

// One user's console sections, for the administrator, a head of a unit the person stands in, or the login they are
// (docs/web.md, 「Access」, and 「Organisation」, the permissions tab).
// The account service decides which callers may read them.
export default defineEventHandler(async (event): Promise<SectionRow[]> => {
  const signed = await signedInUser(event);
  const user = getRouterParam(event, "user") ?? "";

  return await sectionsOf(user, { key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) });
});
