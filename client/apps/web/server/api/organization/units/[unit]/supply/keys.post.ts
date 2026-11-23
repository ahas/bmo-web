import { wording } from "#shared/wording";

import { signedInUser } from "../../../../../utils/accounts";
import { unitNumber } from "../../../../../utils/organization";
import { addKey, orgAgentsFailure } from "../../../../../utils/organisation-supply";

// A key of the unit's added (docs/web.md, 「Organisation」, the agents tab): `road`, `name`, the secret's name in the
// unit's space, and `value`, the key itself, which goes into that space and nowhere else.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ road?: unknown; name?: unknown; value?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  const road = text(body?.road);
  const name = text(body?.name);
  const value = text(body?.value);

  if (road === null || name === null || value === null) throw fail(400, wording("organization.error.bad_request"));

  try {
    await addKey(event, unit, road, name, value, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
