import { wording } from "#shared/wording";

import { unitNumber } from "../../../../utils/organization";
import { isDelegation, orgAgentsFailure } from "../../../../utils/organisation-supply";
import { changePersonalApp, isPersonalAppSetting, personalAppValue } from "../../../../utils/personal-apps-settings";

// A unit's word on one personal app setting, its delegation, or for the administrator on a company the platform's rule
// opening the setting to it (docs/web.md, 「System and organisation」, the apps tab): `setting`, with `value`, `delegation` or
// `offered`, any of them.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ setting?: unknown; value?: unknown; delegation?: unknown; offered?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const setting = body?.setting;

  if (!isPersonalAppSetting(setting)) throw fail(400, wording("organization.error.bad_request"));

  const value = body !== null && "value" in body ? personalAppValue(setting, body.value) : undefined;
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;
  const offered = typeof body?.offered === "boolean" ? body.offered : undefined;

  if (value === undefined && delegation === undefined && offered === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changePersonalApp({ unit }, setting, { value, delegation, offered }, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
