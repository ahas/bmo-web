import { wording } from "#shared/wording";

// The picture the page of one address in a room's message names, redrawn as the card's square by this server, so
// the reader's browser loads no picture from another site (docs/web.md, the link previews rule). The address is the one the
// archived message carries at that place; where its page names no picture or the picture could not be read, the
// card stands without one.
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const messageId = requireMessageId(event);
  const index = Number(getRouterParam(event, "index") ?? "");

  if (!Number.isSafeInteger(index) || index < 0) throw fail(404, wording("common.error.image_unavailable"));

  const picture = await roomLinkPicture(chatId, messageId, index);

  if (picture === null) throw fail(404, wording("common.error.image_unavailable"));

  setResponseHeader(event, "content-type", picture.type);
  setResponseHeader(event, "cache-control", "private, max-age=86400");

  return picture.bytes;
});
