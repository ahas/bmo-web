import { wording } from "#shared/wording";

import { requireOwnSupervisor } from "../../../utils/agent-reach";

import type { SupervisorSleepView } from "#shared/agency";

// One save of whether a supervisor sleeps each night and its own hour, none for the agency's, carried to the agency
// (its `docs/sleep.md`, 「Its setting」); answered with the setting as it then stands.
export default defineEventHandler(async (event): Promise<SupervisorSleepView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));

  await requireOwnSupervisor(event, name);

  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body?.on !== "boolean") throw fail(400, wording("common.error.bad_action"));

  const hour = typeof body.hour === "number" && Number.isInteger(body.hour) && body.hour >= 0 && body.hour < 24 ? body.hour : null;

  return await agencyRoute<SupervisorSleepView>("PUT", `/supervisors/${encodeURIComponent(name)}/sleep`, { on: body.on, hour });
});
