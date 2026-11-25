import { companyRoles } from "../../../../utils/account-service";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

import type { RoleView } from "#shared/roster";

// A company's roles, lowest first, for anyone of the company (docs/web.md, 「System and organisation」, its roles and kinds tab).
export default defineEventHandler(async (event): Promise<RoleView[]> => {
  const signed = await signedInUser(event);
  const company = unitNumber(getRouterParam(event, "company"));

  try {
    return await companyRoles(company, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }
});
