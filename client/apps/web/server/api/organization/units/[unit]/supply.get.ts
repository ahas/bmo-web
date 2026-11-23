import { signedInUser } from "../../../../utils/accounts";
import { unitNumber } from "../../../../utils/organization";
import { orgAgentsFailure, unitSupply } from "../../../../utils/organisation-supply";

import type { UnitSupplyView } from "#shared/organisation-supply";

// A unit's agent supply as the reader stands to it (docs/web.md, 「Organisation」, the supply tab): the three sources
// with what stands and what the reader may change, and the unit's own keys where they head it. `company` says the
// unit is a company, for the administrator's opening of organisation supply to it.
export default defineEventHandler(async (event): Promise<UnitSupplyView> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const company = getQuery(event).company === "true";

  try {
    return await unitSupply(event, unit, company, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
