import { companyBmoPictureOf } from "../../../../../utils/account-service";
import { bmoFailure, idParam } from "../../../../../utils/bmo-routes";
import { callerOf } from "../../../../../utils/organization";

// A company's default picture for its people's BMOs (docs/web.md, 「System and organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<Uint8Array> => {
  const signed = await signedInUser(event);
  const company = idParam(event, "company");

  try {
    const picture = await companyBmoPictureOf(company, callerOf(signed));

    setResponseHeaders(event, { "content-type": picture.type, "cache-control": "private, no-cache" });

    return picture.bytes;
  } catch (error) {
    throw bmoFailure(error);
  }
});
