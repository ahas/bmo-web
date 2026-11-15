import { MAX_ATTACHMENT_BYTES, MAX_SAY_TEXT_LENGTH } from "#shared/config";
import { wording } from "#shared/wording";

import { sayFilesAsAccount, speakerOf } from "../../../utils/console-rooms";
import { exactAnswer, receiver } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";

import type { ExactMessageId, SentMessage } from "#shared/types";

// The recording a browser made, as it reaches the app: the file itself and the words typed beside it.
interface ReceivedVoice {
  sent: { name: string; id: ExactMessageId }[];
  checking: { name: string }[];
  failed: { name: string; reason: unknown }[];
}

function captionOf(field: unknown): string {
  return String(field ?? "")
    .replaceAll(/\r\n?/g, "\n")
    .trim();
}

// The body a voice note may weigh before it is read: its file at its ceiling, and a little for the words and the
// multipart's own frame.
const MAX_BODY_BYTES = MAX_ATTACHMENT_BYTES + 1024 * 1024;

// A voice note recorded in the box goes into the room as a voice message, not as a file. It travels the receiver's
// files route of the signed-in account with the flag that names it a recording, so a chat service that carries voice
// messages receives it as one (the receiver's `docs/api.md`, 「Sends」); it is the account's own, as a typed word is.
// The recording is one file, and its words are its caption.
export default defineEventHandler(async (event): Promise<SentMessage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);
  const speaker = await speakerOf(await signedInUser(event));
  const declared = Number.parseInt(getRequestHeader(event, "content-length") ?? "", 10);

  if (Number.isSafeInteger(declared) && declared > MAX_BODY_BYTES) {
    throw fail(413, wording("room.error.voice_too_large"));
  }

  const parts = (await readMultipartFormData(event)) ?? [];
  const caption = captionOf(new TextDecoder().decode(parts.find((part) => part.name === "caption")?.data ?? new Uint8Array()));
  const file = parts.find((part) => part.name === "file" && part.filename !== undefined);

  if (file === undefined) {
    throw fail(400, wording("room.error.no_voice"));
  }

  if (caption.length > MAX_SAY_TEXT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_SAY_TEXT_LENGTH.toLocaleString("ko-KR") }));
  }

  const name = file.filename ?? "voice";

  if (file.data.length > MAX_ATTACHMENT_BYTES) {
    throw fail(413, wording("room.error.file_too_large_named", { name }));
  }

  if (file.data.length === 0) {
    throw fail(400, wording("room.error.file_empty_named", { name }));
  }

  const replyTo = replyToOf(new TextDecoder().decode(parts.find((part) => part.name === "replyTo")?.data ?? new Uint8Array()));
  const body = new FormData();

  body.set("chatId", String(chatId));
  body.set("text", caption);
  body.set("voice", "true");

  if (replyTo !== null) {
    body.set("replyTo", String(replyTo));
  }

  body.append("file", new File([new Uint8Array(file.data)], name, { type: file.type ?? "" }));

  const watched = (): SentMessage => {
    throw fail(504, wording("room.status.checking"));
  };
  const key = sendKeyOf(new TextDecoder().decode(parts.find((part) => part.name === "key")?.data ?? new Uint8Array()));

  return sendOnce<SentMessage>(
    chatId,
    key,
    async () => {
      const answer =
        speaker === "owner"
          ? ((await exactAnswer<unknown>(receiver().POST("/owner/message-files", { body, parseAs: "text" }))) as ReceivedVoice)
          : await sayFilesAsAccount<ReceivedVoice>(chatId, speaker, body);
      const sent = answer.sent[0];

      if (sent !== undefined) {
        return { messageId: sent.id };
      }

      const failed = answer.failed[0];

      throw fail(502, failed === undefined ? wording("common.error.not_sent") : unsentReason(failed));
    },
    watched
  );
})

// Why a recording did not go, in the pack's words for the reason the receiver gave; a road's own reason stands as the
// road gave it.
function unsentReason(one: { name: string; reason: unknown }): string {
  const reason = (typeof one.reason === "object" && one.reason !== null ? one.reason : { kind: "refused", reason: one.reason }) as Record<string, unknown>;

  if (reason.kind === "empty") return wording("room.error.file_empty_named", { name: one.name });
  if (reason.kind === "too-large") return wording("room.error.file_too_large_named", { name: one.name });

  return typeof reason.reason === "string" && reason.reason !== "" ? `${one.name}: ${reason.reason}` : wording("common.error.not_sent");
}
