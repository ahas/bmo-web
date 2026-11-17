import { unitKinds } from "../../../../utils/account-service";
import { HEAD_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

// A company's unit kinds, in its order, for anyone of the company (docs/web.md, 「Organisation」, its roles and kinds
// tab).
export default defineEventHandler(async (event): Promise<{ key: string; name: string }[]> => {
  const signed = await signedInUser(event);
  const company = unitNumber(getRouterParam(event, "company"));

  try {
    return await unitKinds(company, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, HEAD_CODES);
  }
});
