import { setSections } from "../../../utils/account-service";
import { forgetSectionAccess } from "../../../utils/section-access";
import { ownerKeyOf, ownerRoleOf } from "../../../utils/owner-key";

import type { SectionRow } from "#shared/sections";

interface SectionsBody {
  sections?: SectionRow[];
}

// One user's console sections written whole, by an administrator (docs/web.md, 「Access」). The account service
// refuses any other login before a tuple is written.
export default defineEventHandler(async (event): Promise<SectionRow[]> => {
  const signed = await requireAdministrator(event);
  const user = getRouterParam(event, "user") ?? "";
  const body = await readBody<SectionsBody>(event);
  const asked = (body.sections ?? []).map(({ section, read, write }) => ({ section, read, write }));
  const written = await setSections(user, asked, { key: ownerKeyOf(signed) ?? "", role: ownerRoleOf(signed) });

  forgetSectionAccess(user);

  return written;
});
