import { ownPersona } from "../../utils/organisation-agents";
import { orgAgentsFailure } from "../../utils/organisation-supply";

import type { OwnPersona } from "#shared/organisation-agents";

// The persona's choice as it stands for the signed-in reader's own BMO, with the unit whose lock decides it (docs/web.md,
// 「Settings」, the own-BMO section).
export default defineEventHandler(async (event): Promise<OwnPersona> => {
  try {
    return await ownPersona(await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
