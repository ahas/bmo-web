import { wording } from "#shared/wording";

import type { DraftQuestionView } from "#shared/drafting";

// One question's text set, an existing name's or a new one's (the receiver's `docs/drafting.md`, 「The routes」).
// What the name and the text may be is the receiver's to say; a body without both goes no further.
export default defineEventHandler(async (event): Promise<DraftQuestionView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const text = typeof body?.text === "string" ? body.text : "";

  if (name === "" || text.trim() === "") throw fail(400, wording("common.error.bad_action"));

  return await writeDraftQuestion(name, text);
});
