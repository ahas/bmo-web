import { TEXT_LOCALES } from "#shared/app-catalogue";
import { personalAppName } from "#shared/personal-apps";
import { skillName } from "#shared/personal-skills";
import { wording } from "#shared/wording";

import { shareApp } from "../../utils/app-catalogue";
import { fail } from "../../utils/fail";

import type { CatalogueApp, CatalogueTarget } from "#shared/app-catalogue";

// One of the signed-in reader's own items shared with the targets named (docs/web.md, 「Settings」, the personal apps
// and skills sections' share): a personal app or an MCP item by its name, or a skill kept at home with `kind`
// `skill`, written in the language the body names where it is one of the console's.
export default defineEventHandler(async (event): Promise<CatalogueApp> => {
  const body = (await readBody<{ name?: unknown; targets?: unknown; kind?: unknown; language?: unknown }>(event)) ?? {};
  const kind = body.kind === "skill" ? "skill" : "app";
  const named = typeof body.name === "string" && (kind === "skill" ? skillName(body.name) : personalAppName(body.name));

  if (!named) throw fail(400, wording("app_catalogue.error.not_found"));

  const targets = Array.isArray(body.targets) ? (body.targets as CatalogueTarget[]) : [];
  const language = (TEXT_LOCALES as readonly unknown[]).includes(body.language) ? (body.language as string) : undefined;

  return await shareApp(await signedInUser(event), body.name as string, targets, kind, language);
});
