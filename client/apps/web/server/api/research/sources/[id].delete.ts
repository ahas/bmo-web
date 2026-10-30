import { wording } from "#shared/wording";

import { removeResearchSource, researchIdOf } from "../../../utils/research";

// One source taken away; what it turned up stays (docs/web.md, 「Research screen」).
export default defineEventHandler(async (event): Promise<null> => {
  await requireUserSession(event);

  const sourceId = researchIdOf(getRouterParam(event, "id"));

  if (sourceId === null) throw fail(400, wording("common.error.bad_action"));

  await removeResearchSource(sourceId);

  return null;
});
