import { ownSupplySources } from "../../utils/organisation-agents";
import { orgAgentsFailure } from "../../utils/organisation-supply";

import type { OwnSupplySource } from "#shared/organisation-agents";

// The three supply sources as they stand for the signed-in reader, each with who decided it (docs/web.md, 「Settings」,
// the supply section).
export default defineEventHandler(async (event): Promise<OwnSupplySource[]> => {
  try {
    return await ownSupplySources(await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
