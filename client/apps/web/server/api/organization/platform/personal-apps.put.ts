import { wording } from "#shared/wording";

import { isDelegation, orgAgentsFailure } from "../../../utils/organisation-supply";
import { changePersonalApp, isPersonalAppSetting, personalAppValue } from "../../../utils/personal-apps-settings";

// The platform's word on one personal app setting, and its delegation (docs/web.md, 「System and organisation」, the apps tab with
// the platform chosen). The administrator's.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<{ setting?: unknown; value?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const setting = body?.setting;

  if (!isPersonalAppSetting(setting)) throw fail(400, wording("organization.error.bad_request"));

  const value = body !== null && "value" in body ? personalAppValue(setting, body.value) : undefined;
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if (value === undefined && delegation === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changePersonalApp("platform", setting, { value, delegation }, signed);
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
