import type { FoldRatiosView } from "#shared/agency";

// Every provider's fold ratio at every tier, as the agency reads them (the agency's `docs/api.md`,
// 「fold-ratios」).
export default defineEventHandler(async (event): Promise<FoldRatiosView> => {
  await requireUserSession(event);

  const ratios = await agencyCall(agency().GET("/fold-ratios"));

  return foldRatiosOf(ratios.items);
});
