import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type ModelChange = components["schemas"]["ModelChange"];
import type { ModelView } from "#shared/agency";

// A model registered with the agency (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers and
// fallback」): its key and the model behind it. The agency starts the registration under the key's own name, at
// the registry's smallest sizes and with no address, and refuses a name already registered.
export default defineEventHandler(async (event): Promise<ModelView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";

  if (key === "" || model === "") throw fail(400, wording("agents.error.registry_value"));

  const change: ModelChange = {
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
    key: null
  };

  return await agencyCall(agency().POST("/models", { body: change }));
});
