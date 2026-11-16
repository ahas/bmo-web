import { setCompanyBmoPicture } from "../../../../../utils/account-service";
import { standOwnBmos } from "../../../../../utils/bmo-profile";
import { bmoFailure, idParam, peopleUnder, pictureForm } from "../../../../../utils/bmo-routes";
import { callerOf } from "../../../../../utils/organization";

// A company's default picture set from the form, then applied to the BMO of every person of the company (docs/web.md,
// 「Organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);
  const company = idParam(event, "company");
  const picture = await pictureForm(event);

  try {
    await setCompanyBmoPicture(company, picture, callerOf(signed));
    standOwnBmos(await peopleUnder(company));

    return null;
  } catch (error) {
    throw bmoFailure(error);
  }
});
