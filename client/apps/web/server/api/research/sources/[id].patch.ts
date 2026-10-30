import { wording } from "#shared/wording";

import { changeResearchSource, researchIdOf, researchSourceChangeOf } from "../../../utils/research";

import type { ResearchSource } from "#shared/research";

// One source changed, every field the change leaves out kept (docs/web.md, 「Research screen」).
export default defineEventHandler(async (event): Promise<ResearchSource> => {
  await requireUserSession(event);

  const sourceId = researchIdOf(getRouterParam(event, "id"));
  const change = researchSourceChangeOf(await readBody<unknown>(event));

  if (sourceId === null || change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeResearchSource(sourceId, change);
});
