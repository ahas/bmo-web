import { wording } from "#shared/wording";

import { brainLayerChange, changeBrainLayer } from "../../../utils/brain-layers";
import { organizationFailure } from "../../../utils/organization";

// A layer turned off at the link or on again to follow above, and what the units below may do with it (docs/web.md,
// 「Organisation」, the org memory tab, the read layers): `layer`, `value` false or null, and `delegation`.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await requireAdministrator(event);
  const change = brainLayerChange(await readBody(event).catch(() => null));

  if (change === null) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeBrainLayer(null, change.layer, change, signed);
  } catch (error) {
    throw organizationFailure(error);
  }

  return { ok: true };
});
