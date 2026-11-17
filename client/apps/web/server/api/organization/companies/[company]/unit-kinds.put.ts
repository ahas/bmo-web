import { setUnitKinds } from "../../../../utils/account-service";
import { catalogueOf } from "../../../../utils/catalogue";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

// A company's unit kinds written whole, by the administrator or a head of the company's own unit (docs/web.md,
// 「Organisation」, its roles and kinds tab).
export default defineEventHandler(async (event): Promise<{ key: string; name: string }[]> => {
  const signed = await signedInUser(event);
  const company = unitNumber(getRouterParam(event, "company"));
  const kinds = catalogueOf((await readBody<{ kinds?: unknown }>(event))?.kinds);

  try {
    return await setUnitKinds(company, kinds, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }
});
