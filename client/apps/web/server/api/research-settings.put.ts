import { wording } from "#shared/wording";

import { changeResearchSettings, researchChangeOf } from "../utils/research-settings";

import type { ResearchSettingsView } from "#shared/research";

// One research setting changed, the rest kept (docs/web.md, the searcher tab). Whether the value stands is the
// research unit's to say; a body that names no one setting of its own shape goes no further.
export default defineEventHandler(async (event): Promise<ResearchSettingsView> => {
  await requireUserSession(event);

  const change = researchChangeOf(await readBody<unknown>(event));

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeResearchSettings(change);
});
