import { readResearchState } from "../../utils/research";

import type { ResearchStateView } from "#shared/research";

// Whether the research loop runs, each category with its state and its part of the queue, and what holds the queue
// (docs/web.md, 「Research screen」).
export default defineEventHandler(async (event): Promise<ResearchStateView> => {
  await requireUserSession(event);

  return await readResearchState();
});
