import { wording } from "#shared/wording";

import { readResearchQueue, researchQueueQueryOf } from "../../utils/research";

import type { ResearchQueuePage } from "#shared/research";

// A page of the research queue in the unit's order, narrowed by a category and by states (docs/web.md, 「Research
// screen」).
export default defineEventHandler(async (event): Promise<ResearchQueuePage> => {
  await requireUserSession(event);

  const query = researchQueueQueryOf(getQuery(event));

  if (query === null) throw fail(400, wording("common.error.bad_action"));

  return await readResearchQueue(query);
});
