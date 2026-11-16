import { dropCompanyBmoPicture } from "../../../../../utils/account-service";
import { standOwnBmos } from "../../../../../utils/bmo-profile";
import { bmoFailure, idParam, peopleUnder } from "../../../../../utils/bmo-routes";
import { callerOf } from "../../../../../utils/organization";

// A company's default picture taken away, then every person of the company's BMO takes what stands now (docs/web.md,
// 「Organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const company = idParam(event, "company");

  try {
    await dropCompanyBmoPicture(company, callerOf(signed));
    standOwnBmos(await peopleUnder(company));

    return null;
  } catch (error) {
    throw bmoFailure(error);
  }
});
