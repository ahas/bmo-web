import type { ProviderModelsView } from "#shared/axes";

// The models an order's entry may name on one provider (the agency's `docs/api.md`, 「providers, models and model
// files」); a catalogue that cannot be read answers the agency's refusal, never an empty list.
export default defineEventHandler(async (event): Promise<ProviderModelsView> => {
  await requireUserSession(event);

  return await readProviderModels(axisName(getRouterParam(event, "provider")));
});
