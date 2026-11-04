import { sectionsOf } from "../../utils/account-service";
import { signedInUser } from "../../utils/accounts";
import { ownerKeyOf, ownerRoleOf } from "../../utils/owner-key";
import { CONSOLE_SECTIONS } from "#shared/sections";

import type { SectionRow } from "#shared/sections";

// The signed-in user's own console sections, which the console's navigation and its page guard read
// (docs/web.md, 「Access」). The administrator passes every section, so no call is made for them.
export default defineEventHandler(async (event): Promise<SectionRow[]> => {
  const signed = await signedInUser(event);
  const key = ownerKeyOf(signed);

  if (signed.administrator || key === null) {
    return CONSOLE_SECTIONS.map((section) => ({ section, read: true, write: true }));
  }

  return await sectionsOf(key, { key, role: ownerRoleOf(signed) });
});
