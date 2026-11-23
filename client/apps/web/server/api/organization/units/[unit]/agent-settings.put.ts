import { wording } from "#shared/wording";

import { unitNumber } from "../../../../utils/organization";
import { changeAgentSetting, isAgentSetting, settingValue } from "../../../../utils/organisation-agents";
import { isDelegation, orgAgentsFailure } from "../../../../utils/organisation-supply";

// A unit's word on one of its agent settings, and that setting's delegation (docs/web.md, 「Organisation」, the agents
// tab): `setting`, `instructions`, `persona` or `repositories`, with `value` — a text, `own` or `none`, true or false,
// or null to follow above — and `delegation`, `allow`, `lock` or `inherit`, either or both.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ setting?: unknown; value?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const setting = body?.setting;

  if (!isAgentSetting(setting)) throw fail(400, wording("organization.error.bad_request"));

  const value = body !== null && "value" in body ? settingValue(setting, body.value) : undefined;
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if (value === undefined && delegation === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeAgentSetting(unit, setting, { value, delegation }, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
