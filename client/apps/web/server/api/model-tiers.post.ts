import { wording } from "#shared/wording";

import type { components } from "@agency/client/schema";

type TierChange = components["schemas"]["TierChange"];
import type { TierSettingsView } from "#shared/agency";

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const truth = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

// One change of a tier's mapping for a role (the agency's `docs/api.md`, 「providers, models, pin-checks, tiers and
// fallback」). A save asks the provider's catalogue, so it is given longer than a read.
export default defineEventHandler(async (event): Promise<TierSettingsView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const tier = text(body?.tier);

  if (tier === null) throw fail(400, wording("common.error.bad_action"));

  const change: TierChange = {
    action: text(body?.action) ?? "assign",
    tier,
    key: text(body?.key),
    acceptConflicts: truth(body?.acceptConflicts),
    provider: text(body?.provider),
    model: text(body?.model),
    // The screen says thinking through the effort word, so the switch of its own stays unset.
    thinking: null,
    effort: text(body?.effort),
    answerTokens: whole(body?.answerTokens)
  };

  await agencyCall(agency().PATCH("/tiers/{tierName}", { params: { path: { tierName: tier } }, body: change }));

  const [tiers, providers] = await Promise.all([
    agencyCall(agency().GET("/tiers")),
    agencyCall(agency().GET("/providers"))
  ]);

  return tierSettingsOf(tiers.items, providers.items);
});
