import { MAX_SAY_TEXT_LENGTH } from "#shared/config";
import { wording } from "#shared/wording";

import { sayRoomFiles, speakerOf } from "../../../utils/console-rooms";
import { overLimitWords, roomLimitOnce, unsentReason } from "../../../utils/room-files";
import { requireWritableRoom } from "../../../utils/room-reach";
import { spoolForm } from "../../../utils/streamed-forms";
import { unitRefusalOf } from "../../../utils/units";

import type { Speaker } from "../../../utils/console-rooms";
import type { SpooledFile, SpooledForm } from "../../../utils/streamed-forms";
import type { ExactMessageId, FileLimit, SentAttachments } from "#shared/types";

// The caption a form carried, as it was typed: a form sends every line break as a carriage return and a line feed,
// so the line breaks are read back as line feeds alone and the ends trimmed.
function captionOf(field: string | undefined): string {
  return (field ?? "").replaceAll(/\r\n?/g, "\n").trim();
}

// Files go into a room the same way a typed word does: through the receiver, as the signed-in account's own. They go as
// one send, which the receiver puts into the room as the albums a phone would send, with the words typed beside them
// as the caption (the receiver's `docs/api.md`, 「Sends」). The console sets no limit of its own on a file or on how
// many go: the form is read as it arrives, each file written to a scratch file, and sent on as a stream read back from
// those, so no file is ever held whole here (docs/web.md, the room screen's input box). Every file gets its own answer
// — the ones that landed, the ones that may have, and the ones that did not — because a send that stopped halfway must
// never be retried as a whole.
export default defineEventHandler(async (event): Promise<SentAttachments> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);
  const speaker = await speakerOf(await signedInUser(event));
  const form = await spoolForm(event, "file", MAX_SAY_TEXT_LENGTH);

  try {
    return await sendFiles(chatId, speaker, form);
  } finally {
    await form.drop();
  }
});

async function sendFiles(chatId: number, speaker: Speaker, form: SpooledForm): Promise<SentAttachments> {
  const caption = captionOf(form.fields.get("caption"));
  // The reply rides on the first file, the one the words go with.
  const replyTo = replyToOf(form.fields.get("replyTo") ?? "");
  const going = form.files;

  if (going.length === 0) {
    throw fail(400, wording("room.error.no_file"));
  }

  if (caption.length > MAX_SAY_TEXT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_SAY_TEXT_LENGTH.toLocaleString("ko-KR") }));
  }

  // In the order they were attached, so the receiver gathers the albums in that order and the words land on the first.
  const fields: [string, string][] = [["text", caption], ...(replyTo === null ? [] : [["replyTo", String(replyTo)] as [string, string]])];

  // A try of a send still going under its key may well have gone; its files are watched for rather than
  // failed, so none is sent twice.
  const watched = (): SentAttachments => {
    for (const { name } of going) logUnsent(chatId, name, "is not known to have gone: another try of its send key is still carrying it");

    return { sent: [], failed: [], checking: going.map(({ name }) => ({ name })) };
  };
  const key = sendKeyOf(form.fields.get("key") ?? "");

  return sendOnce<SentAttachments>(
    chatId,
    key,
    async () => {
      const limit = roomLimitOnce(chatId);

      try {
        // The call waits for the receiver's answer however long its uploads take.
        const answer = await sayRoomFiles<ReceivedAttachments>(chatId, speaker, fields, going);

        for (const one of answer.failed) logUnsent(chatId, one.name, `was not sent: the receiver answered ${JSON.stringify(one.reason)}`);
        for (const one of answer.checking) logUnsent(chatId, one.name, "is not known to have gone: the receiver is still drawing on it");

        return {
          sent: answer.sent.map((one) => ({ name: one.name, messageId: one.id })),
          failed: await Promise.all(answer.failed.map(async (one) => ({ name: one.name, reason: await unsentReason(one, limit) }))),
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

        return { sent: [], failed: await Promise.all(going.map(async (file) => ({ name: file.name, reason: await refusedReason(file, error, limit) }))), checking: [] };
      }
    },
    watched
  );
}

// What the receiver answers a send of files with: each file that went, each it is still drawing on, and each
// that did not go with why, as a `FileUnsent` kind (the receiver's `docs/codes.md`) or a reason the road gave.
interface ReceivedAttachments {
  sent: { name: string; id: ExactMessageId }[];
  checking: { name: string }[];
  failed: { name: string; reason: unknown }[];
}

// Why a file in a send the receiver refused as a whole did not go, in a sentence that names the file once. A send
// refused as past the room's limit names the first file it turned away; each file past the limit is said with the
// limit, and any other in the receiver's sentence, or in this app's own words where the call never reached an answer.
async function refusedReason(file: SpooledFile, error: unknown, limit: () => Promise<FileLimit | null>): Promise<string> {
  const failure = error as { statusMessage?: string; message?: string; data?: { code?: unknown } | null };

  if (failure.data?.code === "too-large") {
    const largest = await limit();

    if (largest === null || file.size > largest.bytes) return overLimitWords(file.name, largest);
  }

  const said = failure.statusMessage || failure.message || wording("common.error.not_sent");

  return said.includes(file.name) ? said : `${file.name}: ${said}`;
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
