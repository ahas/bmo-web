import { wording } from "#shared/wording";

import { signedInUser } from "../../utils/accounts";
import { isDelegation } from "../../utils/organisation-supply";
import { unitNumber } from "../../utils/organization";
import { changeRequirement, requirementFailure } from "../../utils/second-factor-chain";

// A node's word on the second factor, true, false or null to follow above, and its delegation, either or both
// (docs/web.md, 「System and organisation」, the security tab). The node is `unit` or `link: "platform"` in the body.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const body = await readBody<{ unit?: unknown; link?: unknown; value?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const unit = body?.link === "platform" ? null : unitNumber(String(body?.unit ?? ""));
  const value = body?.value === null || typeof body?.value === "boolean" ? body.value : undefined;
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if (value === undefined && delegation === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeRequirement(unit, { value, delegation }, await signedInUser(event));
  } catch (error) {
    throw requirementFailure(error);
  }

  return { ok: true };
});
