import { wording } from "#shared/wording";

import { changeAgentSetting, isAgentSetting, settingValue } from "../../../utils/organisation-agents";
import { isDelegation, orgAgentsFailure } from "../../../utils/organisation-supply";

// The platform's word on one of the agent settings, and that setting's delegation (docs/web.md, 「System and organisation」, the
// agents tab with the platform chosen), as a unit's route takes them. The administrator's.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<{ setting?: unknown; value?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const setting = body?.setting;

  if (!isAgentSetting(setting)) throw fail(400, wording("organization.error.bad_request"));

  const value = body !== null && "value" in body ? settingValue(setting, body.value) : undefined;
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if (value === undefined && delegation === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeAgentSetting("platform", setting, { value, delegation }, signed);
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});
