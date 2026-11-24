import { brainLayers } from "../../../../utils/brain-layers";
import { organizationFailure, unitNumber } from "../../../../utils/organization";

import type { BrainLayersView } from "#shared/org-memory";

// Whether the base and the org brains are read for the people under the link (docs/web.md, 「Organisation」, the org
// memory tab, the read layers), as the reader stands to it.
export default defineEventHandler(async (event): Promise<BrainLayersView> => {
  const signed = await signedInUser(event);

  try {
    return await brainLayers(unitNumber(getRouterParam(event, "unit")), signed);
  } catch (error) {
    throw organizationFailure(error);
  }
});
