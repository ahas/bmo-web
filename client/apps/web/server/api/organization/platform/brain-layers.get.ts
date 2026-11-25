import { brainLayers } from "../../../utils/brain-layers";
import { organizationFailure } from "../../../utils/organization";

import type { BrainLayersView } from "#shared/org-memory";

// Whether the base and the org brains are read for the people under the link (docs/web.md, 「System and organisation」, the org
// memory tab, the read layers), as the reader stands to it.
export default defineEventHandler(async (event): Promise<BrainLayersView> => {
  const signed = await requireAdministrator(event);

  try {
    return await brainLayers(null, signed);
  } catch (error) {
    throw organizationFailure(error);
  }
});
