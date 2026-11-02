import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type ModelChange = components["schemas"]["ModelChange"];
import type { ModelView } from "#shared/agency";

// One registered model's model changed (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers and
// fallback」). The key's own name and sizes stay as they are; the model behind the registration is what the change
// edits.
export default defineEventHandler(async (event): Promise<ModelView> => {
  await requireUserSession(event);

  const key = (getRouterParam(event, "modelKey") ?? "").trim();
  const body = await readBody<Record<string, unknown>>(event);
  const model = typeof body?.model === "string" ? body.model.trim() : "";

  if (key === "" || model === "") throw fail(400, wording("agents.error.registry_value"));

  const change: ModelChange = {
    action: "change",
    name: null,
    label: null,
    model,
    contextTokens: null,
    answerTokens: null,
    thinking: null,
    walked: null,
    keepsResearch: null,
    node: null,
    url: null,
    key: null
  };

  return await agencyCall(agency().PATCH("/models/{modelKey}", { params: { path: { modelKey: key } }, body: change }));
});
