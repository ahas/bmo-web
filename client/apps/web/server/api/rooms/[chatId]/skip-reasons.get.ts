import { skipReasonsOf } from "../../../utils/skip-reasons";

import type { SkipReasonPage } from "#shared/types";

// Why the silent turns a room's screen shows sent nothing, in the reader's language (docs/web.md, 「A turn the chat
// agent chose not to answer」): the screen names their verdicts by their numbers and the seconds they were written in,
// `from` to `to`, since the gate finds a room's verdicts by their time, and the language its reader reads. The page
// carries each verdict as its mark alone (「The first frame waits on the messages alone」), so this is read once the
// page stands.
export default defineEventHandler(async (event): Promise<SkipReasonPage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  const ids = requireJudgementIds(query.ids);
  const { from, to } = requireJudgementSpan(query.from, query.to);
  const language = requireLanguage(query.language);

  // A member reads the conversation; the verdicts recorded on it, their reasons among them, are the administrator's
  // (docs/web.md, 「Access」).
  if ((await readableRooms(event)) !== "all") return { reasons: {} };

  // A verdict's time is held in whole seconds, so the second after the last is read too.
  return { reasons: await skipReasonsOf(chatId, ids, { from, to: to + 1 }, language) };
});
