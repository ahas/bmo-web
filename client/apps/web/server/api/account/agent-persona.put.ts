import { wording } from "#shared/wording";

import { setOwnPersona } from "../../utils/organisation-agents";
import { orgAgentsFailure } from "../../utils/organisation-supply";

// The signed-in reader's own word on their BMO's persona: `on`, true or false, or null to follow their organisation
// (docs/web.md, 「Settings」, the own-BMO section). A lock above refuses it at the account service.
export default defineEventHandler(async (event): Promise<null> => {
  const body = await readBody<{ on?: unknown }>(event).catch(() => ({}) as { on?: unknown });
  const on = body?.on;

  if (on !== null && typeof on !== "boolean") throw fail(400, wording("organization.error.bad_request"));

  try {
    await setOwnPersona(await signedInUser(event), on);

    return null;
  } catch (error) {
    throw orgAgentsFailure(error);
  }
});
