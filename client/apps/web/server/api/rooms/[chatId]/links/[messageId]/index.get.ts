import type { LinkPreview } from "#shared/types";

// What the addresses in one message of a room show of themselves: title, description, site and
// whether the page names a picture, as the server reads each page (docs/web.md, the link previews rule). The
// addresses are read from the archived message, never from the request.
export default defineEventHandler(async (event): Promise<LinkPreview[]> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const previews = await roomLinkPreviews(chatId, requireMessageId(event));

  setResponseHeader(event, "cache-control", "private, max-age=3600");

  return previews;
});
