import { readWholeJudgements } from "../../../utils/archive";

import type { Judgement } from "#shared/types";

// The verdicts an answer's opened record stands, whole, read from the gate's own console API (docs/boundary.md,
// 「Gaps the console meets」): the record names them by their numbers and the seconds they were written in, `from`
// to `to`, since the gate finds a room's verdicts by their time. A room's page carries each verdict without what only
// its card stands (docs/web.md, 「The first frame waits on the messages alone」).
export default defineEventHandler(async (event): Promise<{ judgements: Judgement[] }> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  const ids = requireJudgementIds(query.ids);
  const { from, to } = requireJudgementSpan(query.from, query.to);

  // A member reads the conversation; the verdicts recorded on it are the administrator's (docs/web.md, 「Access」).
  if ((await readableRooms(event)) !== "all") return { judgements: [] };

  // A verdict's time is held in whole seconds, so the second after the last is read too.
  return { judgements: await readWholeJudgements(chatId, ids, { from, to: to + 1 }) };
});
