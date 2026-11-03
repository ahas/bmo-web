import { wording } from "#shared/wording";

import type { SupervisorPiecesView } from "#shared/axes";

// One save of a supervisor's own settings — its reference switch, its persona and its generation settings — carried to
// the agency under the signed-in user, who the change is kept as made by (the agency's `docs/api.md`, 「companions and
// companion-resets」).
export default defineEventHandler(async (event): Promise<SupervisorPiecesView> => {
  const session = await requireAdministrator(event);
  const name = axisName(getRouterParam(event, "name"));
  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body !== "object" || body === null) throw fail(400, wording("common.error.bad_action"));

  const saved = await agencyCall(
    agency().PATCH("/companions/{companionName}", {
      params: { path: { companionName: name } },
      body: {
        agent: name,
        by: session.name,
        referenceOn: typeof body.referenceOn === "boolean" ? body.referenceOn : null,
        persona: typeof body.persona === "string" ? body.persona : null,
        registration: null,
        generation: body.generation ?? null,
        thinking: null
      }
    })
  );

  return supervisorPiecesOf(saved);
});
