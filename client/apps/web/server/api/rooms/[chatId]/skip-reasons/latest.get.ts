import { latestSkipReason } from "../../../../utils/skip-reasons";

import type { LatestSkipReason } from "#shared/types";

// Why a room's newest silent turn sent nothing, in the reader's language, for the passing reason of a silent turn that
// read nothing of the room and so stands under no message (docs/web.md, 「A turn the chat agent chose not to
// answer」). The receiver writes the turn's verdict before it tells the stream the turn ended, so the newest verdict is
// that turn's.
export default defineEventHandler(async (event): Promise<LatestSkipReason> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const language = requireLanguage(getQuery(event).language);

  // The reason is a verdict's words, which a member does not read (docs/web.md, 「Access」).
  if ((await readableRooms(event)) !== "all") return { latest: null };

  return await latestSkipReason(chatId, language);
});
