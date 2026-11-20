import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type ModelChange = components["schemas"]["ModelChange"];
import type { ModelView } from "#shared/agency";

// One registered model changed (the agency's `docs/api.md`, 「providers, models and model files」): the model behind
// it, its card service and whether that service keeps role files. Its name and sizes stay as they are.
export default defineEventHandler(async (event): Promise<ModelView> => {
  await requireUserSession(event);

  const key = (getRouterParam(event, "modelKey") ?? "").trim();
  const body = await readBody<Record<string, unknown>>(event);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  // An emptied card service is none, which the agency takes as `none`.
  const cardService = typeof body?.cardService === "string" ? (body.cardService.trim() === "" ? "none" : body.cardService.trim()) : null;

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
    key: null,
    cardService,
    roleFiles: typeof body?.roleFiles === "boolean" ? body.roleFiles : null
  };

  return await agencyCall(agency(event).PATCH("/models/{modelKey}", { params: { path: { modelKey: key } }, body: change }));
});
