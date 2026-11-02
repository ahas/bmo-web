import type { ProviderView } from "#shared/axes";

// Every provider the agency carries, with its switch, its quota and why it cannot answer now (the agency's
// `docs/api.md`, 「providers, models and model files」).
export default defineEventHandler(async (event): Promise<ProviderView[]> => {
  await requireUserSession(event);

  return await readProviders();
});
