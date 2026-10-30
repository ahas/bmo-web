import { wording } from "#shared/wording";

import { changeResearchState, researchStateChangeOf } from "../../utils/research";

import type { ResearchStateView } from "#shared/research";

// One category stopped or started again, or every one where none is named (docs/web.md, 「Research screen」); a body
// that names no state of the two goes no further.
export default defineEventHandler(async (event): Promise<ResearchStateView> => {
  await requireUserSession(event);

  const change = researchStateChangeOf(await readBody<unknown>(event));

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeResearchState(change);
});
