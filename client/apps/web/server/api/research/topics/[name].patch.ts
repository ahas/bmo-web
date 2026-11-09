import { wording } from "#shared/wording";

import { changeResearchTopic, readResearchState, researchTopicChangeOf, researchTopicNameOf } from "../../../utils/research";

import type { ResearchStateView } from "#shared/research";

// One topic changed, every field the change leaves out kept and a calendar given as null taken away (docs/web.md,
// 「Research screen」, the topics tab). A category of another shape is not this route's to change. Answers the categories as they
// now stand.
export default defineEventHandler(async (event): Promise<ResearchStateView> => {
  await requireUserSession(event);

  const name = researchTopicNameOf(getRouterParam(event, "name"));
  const change = researchTopicChangeOf(await readBody<unknown>(event));

  if (name === null || change === null) throw fail(400, wording("common.error.bad_action"));

  await changeResearchTopic(name, change);

  return await readResearchState();
});
