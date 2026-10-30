import { readResearchSources } from "../../utils/research";

import type { ResearchSource } from "#shared/research";

// Every source the research unit reads its categories' candidates from (docs/web.md, 「Research screen」).
export default defineEventHandler(async (event): Promise<{ items: ResearchSource[] }> => {
  await requireUserSession(event);

  return { items: await readResearchSources() };
});
