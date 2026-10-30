import { wording } from "#shared/wording";

import { readResearchRun, researchIdOf } from "../../../utils/research";

import type { ResearchRunDetail } from "#shared/research";

// An item's research run with its log, oldest first (docs/web.md, 「Research screen」).
export default defineEventHandler(async (event): Promise<ResearchRunDetail> => {
  await requireUserSession(event);

  const runId = researchIdOf(getRouterParam(event, "runId"));

  if (runId === null) throw fail(400, wording("common.error.bad_action"));

  return await readResearchRun(runId);
});
