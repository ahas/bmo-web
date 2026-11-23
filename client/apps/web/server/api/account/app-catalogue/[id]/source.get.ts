import { catalogueParam, catalogueSource } from "../../../../utils/app-catalogue";

import type { CatalogueSource } from "#shared/app-catalogue";

// A version of a shared app's source, for a reader who sees the app (docs/web.md, 「App catalogue」, the source).
export default defineEventHandler(async (event): Promise<CatalogueSource> => {
  const id = catalogueParam(getRouterParam(event, "id"));
  const version = getQuery(event).version;

  return await catalogueSource(await signedInUser(event), id, typeof version === "string" && version !== "" ? version : null);
});
