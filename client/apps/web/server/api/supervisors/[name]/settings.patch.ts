import { wording } from "#shared/wording";

import type { SupervisorSettingsView } from "#shared/axes";

// One save of a supervisor's own settings — its reference switch, its persona and its generation settings — carried to
// the agency under the signed-in user, who the change is kept as made by (the agency's `docs/api.md`, 「supervisors」,
// a supervisor's settings). A field the save leaves out is left as it stands.
export default defineEventHandler(async (event): Promise<SupervisorSettingsView> => {
  const session = await requireAdministrator(event);
  const name = axisName(getRouterParam(event, "name"));
  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body !== "object" || body === null) throw fail(400, wording("common.error.bad_action"));

  const saved = await agencyCall(
    agency().PATCH("/supervisors/{supervisorName}/settings", {
      params: { path: { supervisorName: name } },
      body: {
        by: session.name,
        ...(typeof body.referenceOn === "boolean" ? { referenceOn: body.referenceOn } : {}),
        ...(typeof body.persona === "string" || body.persona === null ? { persona: body.persona } : {}),
        ...(typeof body.generation === "object" && body.generation !== null ? { generation: body.generation as Record<string, number | boolean | null> } : {})
      }
    })
  );

  return supervisorSettingsOf(saved);
});
