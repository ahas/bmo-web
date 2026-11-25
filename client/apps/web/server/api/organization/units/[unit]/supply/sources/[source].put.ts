import { wording } from "#shared/wording";

import { signedInUser } from "../../../../../../utils/accounts";
import { unitNumber } from "../../../../../../utils/organization";
import { changeSource, isDelegation, isSource, orgAgentsFailure } from "../../../../../../utils/organisation-supply";

// One source closed at a unit or following above again, and its delegation (docs/web.md, 「System and organisation」, the
// agents tab): `closed`, true or false, and `delegation`, `allow`, `lock` or `inherit`, either or both.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const source = getRouterParam(event, "source");
  const body = await readBody<{ closed?: unknown; delegation?: unknown }>(event).catch(() => ({}) as { closed?: unknown; delegation?: unknown });
  const closed = typeof body?.closed === "boolean" ? body.closed : undefined;
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if (!isSource(source) || (closed === undefined && delegation === undefined)) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeSource(unit, source, { closed, delegation }, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
