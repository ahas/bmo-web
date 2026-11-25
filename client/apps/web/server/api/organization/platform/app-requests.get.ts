import { cataloguePromotions } from "../../../utils/app-catalogue";

import type { CataloguePromotion } from "#shared/app-catalogue";

// Every company's requests to make a shared app a platform app (docs/web.md, 「System and organisation」, the apps tab): the
// administrator's.
export default defineEventHandler(async (event): Promise<CataloguePromotion[]> => {
  return await cataloguePromotions(await requireAdministrator(event));
});
