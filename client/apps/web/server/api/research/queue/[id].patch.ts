import { wording } from "#shared/wording";

import { dismissResearchItem, researchIdOf } from "../../../utils/research";

import type { ResearchItem } from "#shared/research";

// One item dismissed from the research queue (docs/web.md, 「Research screen」): the one change the console makes on
// an item, so a body asking any other goes no further.
export default defineEventHandler(async (event): Promise<ResearchItem> => {
  await requireUserSession(event);

  const itemId = researchIdOf(getRouterParam(event, "id"));
  const body = await readBody<unknown>(event);
  const dismissed = typeof body === "object" && body !== null && (body as Record<string, unknown>).state === "dismissed" && Object.keys(body).length === 1;

  if (itemId === null || !dismissed) throw fail(400, wording("common.error.bad_action"));

  return await dismissResearchItem(itemId);
});
