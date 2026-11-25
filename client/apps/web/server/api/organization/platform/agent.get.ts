import { platformBmoOf } from "../../../utils/account-service";
import { bmoFailure } from "../../../utils/bmo-routes";
import { callerOf } from "../../../utils/organization";

import type { CompanyBmoView } from "#shared/bmo-profile";

// The platform's own default for every company's people's BMOs (docs/web.md, 「System and organisation」, the agents tab with
// the platform chosen): the administrator's.
export default defineEventHandler(async (event): Promise<CompanyBmoView> => {
  const signed = await requireAdministrator(event);

  try {
    return await platformBmoOf(callerOf(signed));
  } catch (error) {
    throw bmoFailure(error);
  }
});
