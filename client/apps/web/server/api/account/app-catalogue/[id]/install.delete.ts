import { actOnApp, catalogueParam } from "../../../../utils/app-catalogue";

import type { CatalogueApp } from "#shared/app-catalogue";

// The signed-in reader's copy of a shared app dropped (docs/web.md, 「App catalogue」).
export default defineEventHandler(async (event): Promise<CatalogueApp> => {
  const id = catalogueParam(getRouterParam(event, "id"));

  return await actOnApp(await signedInUser(event), id, "uninstall");
});
