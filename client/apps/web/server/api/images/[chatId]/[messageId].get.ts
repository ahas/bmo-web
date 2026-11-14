// A photo is served by the message it belongs to, never by a path the browser names: the receiver hands over the
// picture that message stored (its `docs/boundary-api.md`, 「A message's files and picture」), and a message whose
// picture is not kept answers as not found, so the room stands its frame without it.
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const messageId = requireMessageId(event);

  const range = getRequestHeader(event, "range");
  const answer = await unitBytes("RECEIVER", `/rooms/${chatId}/messages/${messageId}/picture`, {
    headers: range === undefined ? {} : { range },
    codes: { "not-found": "room.error.photo_not_found" }
  });

  return sendWebResponse(event, servedFile(answer));
});
