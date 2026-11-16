import { wording } from "#shared/wording";

import { setCompanyBmo } from "../../../../utils/account-service";
import { standOwnBmos } from "../../../../utils/bmo-profile";
import { bmoFailure, idParam, peopleUnder } from "../../../../utils/bmo-routes";
import { callerOf } from "../../../../utils/organization";

import type { CompanyBmoView } from "#shared/bmo-profile";

// A company's default name and call names saved, for the administrator and the company's heads, then applied to the BMO
// of every person of the company (docs/web.md, 「Organisation」, the BMO tab).
export default defineEventHandler(async (event): Promise<CompanyBmoView> => {
  const signed = await signedInUser(event);
  const company = idParam(event, "company");
  const body = await readBody<{ name?: unknown; callNames?: unknown }>(event);

  if (typeof body !== "object" || body === null || !Array.isArray(body.callNames)) throw fail(400, wording("bmo_profile.error.bad_profile"));

  const name = typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : null;
  const callNames = body.callNames.filter((one): one is string => typeof one === "string");

  try {
    const saved = await setCompanyBmo(company, { name, callNames }, callerOf(signed));

    standOwnBmos(await peopleUnder(company));

    return saved;
  } catch (error) {
    throw bmoFailure(error);
  }
});
