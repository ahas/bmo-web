import { actOnApp, catalogueParam } from "../../../../../utils/app-catalogue";

import type { CatalogueApp } from "#shared/app-catalogue";

// A shared app turned on or off for a unit the signed-in reader heads, locked for those under it where asked
// (docs/web.md, 「App catalogue」, the head's turning on).
export default defineEventHandler(async (event): Promise<CatalogueApp> => {
  const id = catalogueParam(getRouterParam(event, "id"));
  const body = (await readBody<{ on?: unknown; lock?: unknown }>(event).catch(() => null)) ?? {};

  return await actOnApp(await signedInUser(event), id, "unit", { unit: getRouterParam(event, "unit"), on: body.on, lock: body.lock });
});
