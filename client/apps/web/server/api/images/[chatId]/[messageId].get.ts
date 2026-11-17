import { framesAsked, FRAMES_FIELD } from "#shared/sticker-frames";

// A photo is served by the message it belongs to, never by a path the browser names: the receiver hands over the
// picture that message stored (its `docs/boundary-api.md`, 「A message's files and picture」), and a message whose
// picture is not kept answers as not found, so the room stands its frame without it. A sticker kept as the message's
// picture is asked for looping or still, and goes out written so (docs/web.md, the room screen's wordless messages).
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const messageId = requireMessageId(event);

  const frames = framesAsked(getQuery(event)[FRAMES_FIELD]);
  // A picture written to play as asked is read whole.
  const range = frames === null ? getRequestHeader(event, "range") : undefined;
  const answer = await unitBytes("RECEIVER", `/rooms/${chatId}/messages/${messageId}/picture`, {
    headers: range === undefined ? {} : { range },
    codes: { "not-found": "room.error.photo_not_found" }
  });

  return sendWebResponse(event, frames === null ? servedFile(answer) : await framedPicture(servedFile(answer), frames));
});
