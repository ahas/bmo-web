import { drawnStep, WIDTH_FIELD } from "#shared/drawn-pictures";
import { framesAsked, FRAMES_FIELD } from "#shared/sticker-frames";

import { drawnCopy } from "../../../utils/drawn-pictures";

// A photo is served by the message it belongs to, never by a path the browser names: the receiver hands over the
// picture that message stored (its `docs/boundary-api.md`, 「A message's files and picture」), and a message whose
// picture is not kept answers as not found, so the room stands its frame without it. A sticker kept as the message's
// picture is asked for looping or still, and goes out written so (docs/web.md, the room screen's wordless messages).
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const messageId = requireMessageId(event);

  const query = getQuery(event);
  const frames = framesAsked(query[FRAMES_FIELD]);
  // A width asked for is answered with the copy at that step (docs/web.md, 「A picture drawn small」); a sticker asked
  // to play one way goes out as that asks instead.
  const step = frames === null ? drawnStep(query[WIDTH_FIELD]) : null;
  // A picture written to play as asked is read whole.
  const range = frames === null && step === null ? getRequestHeader(event, "range") : undefined;
  const answer = await unitBytes("RECEIVER", `/rooms/${chatId}/messages/${messageId}/picture`, {
    headers: range === undefined ? {} : { range },
    codes: { "not-found": "room.error.photo_not_found" }
  });

  if (step !== null) return sendWebResponse(event, await drawnAnswer(servedFile(answer), `picture/${chatId}/${messageId}`, step));

  return sendWebResponse(event, frames === null ? servedFile(answer) : await framedPicture(servedFile(answer), frames));
});

// A message's picture is never written again, so its copy at a step is kept under the message alone.
async function drawnAnswer(answer: Response, key: string, step: number): Promise<Response> {
  if (!answer.ok) return answer;

  const original = { bytes: new Uint8Array(await answer.arrayBuffer()), type: answer.headers.get("content-type") ?? "application/octet-stream" };
  const copy = await drawnCopy(key, original, step, "shape");
  const headers = new Headers(answer.headers);

  headers.delete("accept-ranges");
  headers.delete("content-range");
  headers.set("content-type", copy.type);
  headers.set("content-length", String(copy.bytes.byteLength));

  return new Response(copy.bytes.slice(), { status: 200, headers });
}
