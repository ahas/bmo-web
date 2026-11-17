import { setCompanyRoles } from "../../../../utils/account-service";
import { catalogueOf } from "../../../../utils/catalogue";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

import type { RoleView } from "#shared/roster";

// A company's roles written whole, lowest first, by the administrator or a head of the company's own unit (docs/web.md,
// 「Organisation」, its roles and kinds tab).
export default defineEventHandler(async (event): Promise<RoleView[]> => {
  const signed = await signedInUser(event);
  const company = unitNumber(getRouterParam(event, "company"));
  const roles = catalogueOf((await readBody<{ roles?: unknown }>(event))?.roles);

  try {
    return await setCompanyRoles(company, roles, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }
});
