import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type ModelChange = components["schemas"]["ModelChange"];
import type { ModelView } from "#shared/agency";

// A model registered with the agency (the agency's `docs/api.md`, 「providers, models and model files」): its key,
// the model behind it, its card service and whether that service keeps role files. The agency starts the registration under the key's own name, at
// the registry's smallest sizes and with no address, and refuses a name already registered.
export default defineEventHandler(async (event): Promise<ModelView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const cardService = typeof body?.cardService === "string" && body.cardService.trim() !== "" ? body.cardService.trim() : null;

  if (key === "" || model === "") throw fail(400, wording("agents.error.registry_value"));

  // A registration filed under a unit is named by `unit`, as the agency reads it (the agency's `docs/api.md`,
  // 「Who a caller acts for」); the agency judges whose unit may file one.
  const unit = typeof body?.unit === "number" && Number.isInteger(body.unit) && body.unit >= 1 ? body.unit : undefined;
  const change: ModelChange & { unit?: number } = {
    action: "add",
    name: key,
    label: key,
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
    roleFiles: typeof body?.roleFiles === "boolean" ? body.roleFiles : null,
    ...(unit === undefined ? {} : { unit })
  };

  return await agencyCall(agency(event).POST("/models", { body: change }));
});
