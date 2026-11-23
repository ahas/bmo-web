import { signedInUser } from "../../../../utils/accounts";
import { unitNumber } from "../../../../utils/organization";
import { orgAgentsFailure, unitComposition } from "../../../../utils/organisation-supply";

import type { CompositionView } from "#shared/organisation-supply";

// A unit's sign-up composition (docs/web.md, 「Organisation」, the BMO tab): each role with what stands there and the
// unit's own word, and what the reader may change.
export default defineEventHandler(async (event): Promise<CompositionView> => {
  const unit = unitNumber(getRouterParam(event, "unit"));

  try {
    return await unitComposition(event, unit, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
