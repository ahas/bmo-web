import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_SAY_TEXT_LENGTH } from "#shared/config";
import { wording } from "#shared/wording";

import { sayFilesAsAccount, speakerOf } from "../../../utils/console-rooms";
import { exactAnswer, receiver } from "../../../utils/receiver";
import { requireWritableRoom } from "../../../utils/room-reach";
import { unitRefusalOf } from "../../../utils/units";

import type { ExactMessageId, SentAttachments } from "#shared/types";

// The caption a form carried, as it was typed: a form sends every line break as a carriage return and a line feed,
// so the line breaks are read back as line feeds alone and the ends trimmed.
function captionOf(field: unknown): string {
  return String(field ?? "")
    .replaceAll(/\r\n?/g, "\n")
    .trim();
}

// What a body may weigh before it is even read: every file at its ceiling, and a little for the
// words and the multipart's own frame. A body past this is turned away without being held.
const MAX_BODY_BYTES = MAX_ATTACHMENT_BYTES * MAX_ATTACHMENTS + 1024 * 1024;

// Files go into a room the same way a typed word does: through the receiver, as the signed-in account's own. They go as
// one send, which the receiver puts into the room as the albums a phone would send, with the words typed beside them
// as the caption (the receiver's `docs/boundary-api.md`, `POST /say-file`). Every
// file gets its own answer — the ones that landed, the ones that may have, and the ones that did
// not — because a send that stopped halfway must never be retried as a whole.
export default defineEventHandler(async (event): Promise<SentAttachments> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);
  const speaker = await speakerOf(await signedInUser(event));
  const declared = Number.parseInt(getRequestHeader(event, "content-length") ?? "", 10);

  if (Number.isSafeInteger(declared) && declared > MAX_BODY_BYTES) {
    throw fail(413, wording("common.error.attachments_too_large", { n: MAX_ATTACHMENTS }));
  }

  const parts = (await readMultipartFormData(event)) ?? [];
  const caption = captionOf(new TextDecoder().decode(parts.find((part) => part.name === "caption")?.data ?? new Uint8Array()));
  const files = parts.filter((part) => part.name === "file" && part.filename !== undefined);
  // The reply rides on the first file, the one the words go with.
  const replyTo = replyToOf(new TextDecoder().decode(parts.find((part) => part.name === "replyTo")?.data ?? new Uint8Array()));

  if (files.length === 0) {
    throw fail(400, wording("room.error.no_file"));
  }

  if (files.length > MAX_ATTACHMENTS) {
    throw fail(400, wording("common.error.attachments_too_many", { n: MAX_ATTACHMENTS }));
  }

  if (caption.length > MAX_SAY_TEXT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_SAY_TEXT_LENGTH.toLocaleString("ko-KR") }));
  }

  const failed: SentAttachments["failed"] = [];
  const going: { name: string; data: Buffer; type?: string }[] = [];

  for (const file of files) {
    const name = file.filename ?? "attachment";

    if (file.data.length > MAX_ATTACHMENT_BYTES) {
      failed.push({ name, reason: wording("room.error.file_too_large_named", { name }) });
      logUnsent(chatId, name, `was not sent: ${file.data.length} bytes, past the ${MAX_ATTACHMENT_BYTES} one file may be`);
    } else {
      going.push({ name, data: file.data, type: file.type });
    }
  }

  if (going.length === 0) {
    return { sent: [], failed, checking: [] };
  }

  // In the order they were attached, so the receiver gathers the albums in that order and the words
  // land on the first.
  const body = new FormData();

  body.set("chatId", String(chatId));
  body.set("text", caption);

  if (replyTo !== null) {
    body.set("replyTo", String(replyTo));
  }

  for (const file of going) {
    body.append("file", new File([new Uint8Array(file.data)], file.name, { type: file.type ?? "" }));
  }

  // A try of a send still going under its key may well have gone; its files are watched for rather than
  // failed, so none is sent twice.
  const watched = (): SentAttachments => {
    for (const { name } of going) logUnsent(chatId, name, "is not known to have gone: another try of its send key is still carrying it");

    return { sent: [], failed, checking: going.map(({ name }) => ({ name })) };
  };
  const key = sendKeyOf(new TextDecoder().decode(parts.find((part) => part.name === "key")?.data ?? new Uint8Array()));

  return sendOnce<SentAttachments>(
    chatId,
    key,
    async () => {
      try {
        // The call waits for the receiver's answer however long its uploads take.
        const answer =
          speaker === "owner"
            ? ((await exactAnswer<unknown>(receiver().POST("/owner/message-files", { body, parseAs: "text" }))) as ReceivedAttachments)
            : await sayFilesAsAccount<ReceivedAttachments>(chatId, speaker, body);

        for (const one of answer.failed) logUnsent(chatId, one.name, `was not sent: the receiver answered ${JSON.stringify(one.reason)}`);
        for (const one of answer.checking) logUnsent(chatId, one.name, "is not known to have gone: the receiver is still drawing on it");

        return {
          sent: answer.sent.map((one) => ({ name: one.name, messageId: one.id })),
          failed: [...failed, ...answer.failed.map((one) => ({ name: one.name, reason: unsentReason(one) }))],
          checking: answer.checking.map((one) => ({ name: one.name }))
        };
      } catch (error) {
        // A receiver that did not take the call has sent none of them: the send waits on the screen and goes again
        // once the receiver answers.
        if ((error as { statusCode?: unknown }).statusCode === 503) {
          for (const { name } of going) logUnsent(chatId, name, "was not sent: the receiver took no call, so the send waits to go again");

          throw error;
        }

        const why = refusalWords(error);

        for (const { name } of going) logUnsent(chatId, name, why);

        return { sent: [], failed: [...failed, ...going.map(({ name }) => ({ name, reason: refusedReason(name, error) }))], checking: [] };
      }
    },
    watched
  );
})

// What the receiver answers a send of files with: each file that went, each it is still drawing on, and each
// that did not go with why, as a `FileUnsent` kind (the receiver's `docs/codes.md`) or a reason the road gave.
interface ReceivedAttachments {
  sent: { name: string; id: ExactMessageId }[];
  checking: { name: string }[];
  failed: { name: string; reason: unknown }[];
}

// Why one file did not go, in the pack's words for its kind; a road's own reason stands as the road gave it.
function unsentReason(one: { name: string; reason: unknown }): string {
  const reason = (typeof one.reason === "object" && one.reason !== null ? one.reason : { kind: "refused", reason: one.reason }) as Record<string, unknown>;

  if (reason.kind === "empty") return wording("room.error.file_empty_named", { name: one.name });
  if (reason.kind === "too-large") return wording("room.error.file_too_large_named", { name: one.name });

  return typeof reason.reason === "string" && reason.reason !== "" ? `${one.name}: ${reason.reason}` : wording("common.error.not_sent");
}

// Why a file in a send the receiver refused as a whole did not go, in a sentence that names the file once: a request
// past the receiver's ceiling for one send, which names no file, is said as the console's own ceiling, and any
// other refusal in the pack's sentence for it, or in this app's own words where the call never reached an answer.
function refusedReason(name: string, error: unknown): string {
  const failure = error as { statusCode?: unknown; statusMessage?: string; message?: string; data?: { code?: unknown } | null };
  const said =
    failure.statusCode === 413 && failure.data?.code !== "too-large"
      ? wording("common.error.attachments_too_large", { n: MAX_ATTACHMENTS })
      : failure.statusMessage || failure.message || wording("common.error.not_sent");

  return said.includes(name) ? said : `${name}: ${said}`;
}

// What the log says of a send the receiver refused as a whole: the receiver's own status and words where it
// answered, and the error itself where it never did.
function refusalWords(error: unknown): string {
  const refusal = unitRefusalOf(error);

  if (refusal === null) return `was not sent: the send failed before the receiver answered: ${String(error)}`;

  return `was not sent: the receiver refused the send with ${refusal.status}${refusal.said === null ? "" : `: ${refusal.said}`}`;
}

// Every file that does not go, or is not yet known to have gone, is written to this server's log, one line each,
// since the screen only shows its row's reason (docs/web.md, the room screen's attachments).
function logUnsent(chatId: number, name: string, what: string): void {
  console.warn(`room ${chatId}: file ${JSON.stringify(name)} ${what}`);
}
