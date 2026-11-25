import { companyBmoOf } from "../../../../utils/account-service";
import { bmoFailure, idParam } from "../../../../utils/bmo-routes";
import { callerOf } from "../../../../utils/organization";

import type { CompanyBmoView } from "#shared/bmo-profile";

// A company's default for its people's BMOs (docs/web.md, 「System and organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<CompanyBmoView> => {
  const signed = await signedInUser(event);
  const company = idParam(event, "company");

  try {
    return await companyBmoOf(company, callerOf(signed));
  } catch (error) {
    throw bmoFailure(error);
  }
});
