import { wording } from "#shared/wording";

import type { PoolLimitView } from "#shared/agency";

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const count = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

// One place's limit in the co-worker pool set (the agency's `docs/api.md`, 「pool, seat-requests, reservations and
// roles」). It stands before the relay that hands every other pool path on, so a refusal is said in the pack's words.
// Whether the provider and the tier hold a place is the agency's to say; a body that names no provider, no tier or
// no whole number from 0 goes no further.
export default defineEventHandler(async (event): Promise<PoolLimitView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const provider = text(body?.provider);
  const tier = text(body?.tier);
  const capacity = count(body?.capacity);

  if (provider === null || tier === null || capacity === null) throw fail(400, wording("common.error.bad_action"));

  return await agencyRoute<PoolLimitView>("PATCH", "/pool/limits", { provider, tier, capacity });
});
