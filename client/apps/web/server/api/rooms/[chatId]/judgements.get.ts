import { readJudgementPage } from "../../../utils/archive";
import { readCursor, readLimit } from "../../../utils/request";

import type { JudgementPage } from "#shared/types";

// A room's judgements newest first, read from the gate's own console API (docs/boundary.md, 「Gaps the console
// meets」): the verdicts a message was judged by, paged back by the row the reader holds.
export default defineEventHandler(async (event): Promise<JudgementPage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  // A member reads the conversation; the verdicts recorded on it are the administrator's (docs/web.md, 「Access」).
  if ((await readableRooms(event)) !== "all") return { judgements: [], hasMore: false };

  const query = getQuery(event);

  return await readJudgementPage(chatId, readCursor(query.before), readLimit(query.limit));
});
