import { catalogueConnection, catalogueParam } from "../../../../utils/app-catalogue";

import type { CatalogueConnection } from "#shared/app-catalogue";

// How a shared MCP item connects, read off its newest version's `mcp.toml`, for a reader who sees it (docs/web.md,
// 「App catalogue」, the details of an MCP item); null where the source holds none that reads.
export default defineEventHandler(async (event): Promise<CatalogueConnection | null> => {
  const id = catalogueParam(getRouterParam(event, "id"));

  return await catalogueConnection(await signedInUser(event), id, getQuery(event).company);
});
