import { wording } from "#shared/wording";

import type { FoldRatioView } from "#shared/agency";

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const share = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// One provider's fold ratio at one tier set (the agency's `docs/api.md`, 「fold-ratios」). Whether the ratio
// stands is the agency's to say; a body that names no provider, no tier or no number goes no further.
export default defineEventHandler(async (event): Promise<FoldRatioView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const provider = text(body?.provider);
  const tier = text(body?.tier);
  const ratio = share(body?.ratio);

  if (provider === null || tier === null || ratio === null) throw fail(400, wording("common.error.bad_action"));

  const saved = await agencyCall(agency().PUT("/fold-ratios/{provider}/{tier}", { params: { path: { provider, tier } }, body: { ratio } }));

  return foldRatioView(saved);
});
