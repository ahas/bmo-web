import { wording } from "#shared/wording";

import { addResearchSource, researchNewSourceOf } from "../../utils/research";

import type { ResearchSource } from "#shared/research";

// One source registered (docs/web.md, 「Research screen」). Whether its kind takes what it names is the research
// unit's to say; a body missing its category or its kind, or naming a field not of its shape, goes no further.
export default defineEventHandler(async (event): Promise<ResearchSource> => {
  await requireUserSession(event);

  const source = researchNewSourceOf(await readBody<unknown>(event));

  if (source === null) throw fail(400, wording("common.error.bad_action"));

  return await addResearchSource(source);
});
