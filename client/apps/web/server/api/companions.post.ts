import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type CompanionChange = components["schemas"]["CompanionChange"];
import type { CompanionView } from "#shared/agency";

// One save of a companion's settings, carried to the agency under the signed-in user, who the change is kept as
// made by (the agency's `docs/api.md`, 「companions」).
export default defineEventHandler(async (event): Promise<CompanionView> => {
  const session = await requireUserSession(event);
  const body = await readBody<Record<string, unknown>>(event);

  if (typeof body !== "object" || body === null || typeof body.agent !== "string") throw fail(400, wording("agents.error.companion_change"));

  const change: CompanionChange = {
    agent: body.agent,
    by: session.user.name,
    referenceOn: typeof body.referenceOn === "boolean" ? body.referenceOn : null,
    ownPieces: body.ownPieces ?? null,
    pieces: body.pieces ?? null,
    persona: typeof body.persona === "string" ? body.persona : null,
    registration: typeof body.registration === "string" ? body.registration : null,
    generation: body.generation ?? null,
    thinking: typeof body.thinking === "boolean" ? body.thinking : null
  };
  const saved = await agencyCall(agency().PATCH("/companions/{companionName}", { params: { path: { companionName: body.agent } }, body: change }));

  return companionViewOf(saved);
});
