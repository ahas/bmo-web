import { wording } from "#shared/wording";

import { askResearch, researchAskOf } from "../../utils/research";

import type { ResearchItem } from "#shared/research";

// One thing asked for by its category, its name and its maker's address (docs/web.md, 「Research screen」). Whether
// it is taken is the research unit's to say; a body missing any of the three goes no further.
export default defineEventHandler(async (event): Promise<ResearchItem> => {
  await requireUserSession(event);

  const ask = researchAskOf(await readBody<unknown>(event));

  if (ask === null) throw fail(400, wording("common.error.bad_action"));

  return await askResearch(ask);
});
