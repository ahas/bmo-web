import type { TierSettingsView } from "#shared/agency";

// The tiers, the providers that carry them and every work key's tier with what it resolves to, as the agency reads
// them (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers and fallback」, and its `GET /work-keys`).
export default defineEventHandler(async (event): Promise<TierSettingsView> => {
  await requireUserSession(event);

  const [tiers, providers, keys] = await Promise.all([
    agencyCall(agency().GET("/tiers")),
    agencyCall(agency().GET("/providers")),
    agencyCall(agency().GET("/work-keys"))
  ]);

  return tierSettingsOf(tiers.items, providers.items, keys.items);
});
