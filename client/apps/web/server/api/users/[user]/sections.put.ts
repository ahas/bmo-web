import { setSections } from "../../../utils/account-service";
import { signedInUser } from "../../../utils/accounts";
import { forgetSectionAccess } from "../../../utils/section-access";
import { ownerKeyOf, ownerRoleOf } from "../../../utils/owner-key";

import type { SectionRow } from "#shared/sections";

interface SectionsBody {
  sections?: SectionRow[];
}

// One user's console sections written whole, by an administrator or by a head of a unit the person stands in, within
// the sections the head holds (docs/web.md, 「System and organisation」, the permissions tab). The account service judges the
// writer and refuses anyone else before a tuple is written.
export default defineEventHandler(async (event): Promise<SectionRow[]> => {
  const signed = await signedInUser(event);
  const user = getRouterParam(event, "user") ?? "";
  const body = await readBody<SectionsBody>(event);
  const asked = (body.sections ?? []).map(({ section, read, write }) => ({ section, read, write }));
  const written = await setSections(user, asked, { key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) });

  forgetSectionAccess(user);

  return written;
});
