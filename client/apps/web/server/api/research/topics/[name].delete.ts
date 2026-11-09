import { wording } from "#shared/wording";

import { readResearchState, removeResearchTopic, researchTopicNameOf } from "../../../utils/research";

import type { ResearchStateView } from "#shared/research";

// One topic taken away with its recipients (docs/web.md, 「Research screen」, the topics tab); one a source or a waiting or
// running item still names is the research unit's to refuse. Answers the categories as they now stand.
export default defineEventHandler(async (event): Promise<ResearchStateView> => {
  await requireUserSession(event);

  const name = researchTopicNameOf(getRouterParam(event, "name"));

  if (name === null) throw fail(400, wording("common.error.bad_action"));

  await removeResearchTopic(name);

  return await readResearchState();
});
