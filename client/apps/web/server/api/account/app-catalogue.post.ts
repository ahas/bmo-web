import { personalAppName } from "#shared/personal-apps";
import { wording } from "#shared/wording";

import { shareApp } from "../../utils/app-catalogue";
import { fail } from "../../utils/fail";

import type { CatalogueApp, CatalogueTarget } from "#shared/app-catalogue";

// One of the signed-in reader's personal apps shared with the targets named (docs/web.md, 「Settings」, the personal
// apps section's share).
export default defineEventHandler(async (event): Promise<CatalogueApp> => {
  const body = (await readBody<{ name?: unknown; targets?: unknown }>(event)) ?? {};

  if (typeof body.name !== "string" || !personalAppName(body.name)) throw fail(400, wording("app_catalogue.error.not_found"));

  const targets = Array.isArray(body.targets) ? (body.targets as CatalogueTarget[]) : [];

  return await shareApp(await signedInUser(event), body.name, targets);
});
