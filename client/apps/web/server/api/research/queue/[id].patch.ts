import { wording } from "#shared/wording";

import { changeResearchItem, researchIdOf, researchItemChangeOf } from "../../../utils/research";

import type { ResearchItem } from "#shared/research";

// One item of the research queue changed (docs/web.md, 「Research screen」): dismissed, or a stuck one asked again or
// moved to the front, the changes the console makes on an item, so a body asking any other goes no further.
export default defineEventHandler(async (event): Promise<ResearchItem> => {
  await requireUserSession(event);

  const itemId = researchIdOf(getRouterParam(event, "id"));
  const change = researchItemChangeOf(await readBody<unknown>(event));

  if (itemId === null || change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeResearchItem(itemId, change);
});
