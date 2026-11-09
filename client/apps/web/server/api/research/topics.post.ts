import { wording } from "#shared/wording";

import { addResearchTopic, readResearchState, researchNewTopicOf } from "../../utils/research";

import type { ResearchStateView } from "#shared/research";

// One topic registered, a category of the shape `topic` (docs/web.md, 「Research screen」, the topics tab). Whether its name and
// its calendar stand is the research unit's to say; a body missing its name, its purpose or its instruction, or
// naming a field not of its shape, goes no further. Answers the categories as they now stand.
export default defineEventHandler(async (event): Promise<ResearchStateView> => {
  await requireUserSession(event);

  const topic = researchNewTopicOf(await readBody<unknown>(event));

  if (topic === null) throw fail(400, wording("common.error.bad_action"));

  await addResearchTopic(topic);

  return await readResearchState();
});
