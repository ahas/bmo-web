import { wording } from "#shared/wording";

// A kept file is served by the message it belongs to, never by a path the browser names, and only to somebody who
// has logged in, in a room their user may read. The receiver lists the message's files and hands over the bytes of
// the one asked for (its `docs/boundary-api.md`, 「A message's files and picture」); this console decides what it
// goes out as. A player seeking through a sound asks for a stretch of it at a time, and the range is handed on.
export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, "kind") ?? "";

  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const messageId = requireMessageId(event);

  const query = getQuery(event);
  const file = fileAsked(kind, await messageFiles(chatId, messageId), whole(query.item));
  const out = file === null ? null : fileOut(kind, file, query.as === "download");

  if (file === null || out === null) {
    throw fail(404, wording("room.error.file_not_found"));
  }

  const range = getRequestHeader(event, "range");
  const answer = await unitBytes("RECEIVER", `/rooms/${chatId}/messages/${messageId}/files/${file.place}${out.keep ? "?download=true" : ""}`, {
    headers: range === undefined ? {} : { range },
    codes: { "not-found": "room.error.file_not_found" }
  });

  return sendWebResponse(event, servedFile(answer, out));
});

// A whole number an address names, or nothing where it names none.
function whole(value: unknown): number | null {
  const asked = Number.parseInt(typeof value === "string" ? value : "", 10);

  return Number.isSafeInteger(asked) ? asked : null;
}
