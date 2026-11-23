import { wording } from "#shared/wording";

import { signedInUser } from "../../../../../utils/accounts";
import { unitNumber } from "../../../../../utils/organization";
import { openToCompany, orgAgentsFailure } from "../../../../../utils/organisation-supply";

// Organisation supply opened to a company or closed by the administrator (docs/web.md, 「Organisation」, the supply
// tab): `opened`, true or false.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ opened?: unknown }>(event).catch(() => ({}) as { opened?: unknown });

  if (typeof body?.opened !== "boolean") throw fail(400, wording("organization.error.bad_request"));

  try {
    await openToCompany(unit, body.opened, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
