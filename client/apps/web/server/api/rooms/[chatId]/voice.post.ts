import { MAX_SAY_TEXT_LENGTH } from "#shared/config";
import { wording } from "#shared/wording";

import { sayRoomFiles, speakerOf } from "../../../utils/console-rooms";
import { overLimitWords, roomLimitOnce, unsentReason } from "../../../utils/room-files";
import { requireWritableRoom } from "../../../utils/room-reach";
import { spoolForm } from "../../../utils/streamed-forms";

import type { Speaker } from "../../../utils/console-rooms";
import type { SpooledForm } from "../../../utils/streamed-forms";
import type { ExactMessageId, SentMessage } from "#shared/types";

// The recording a browser made, as the receiver answers its send: the file that went, or why it did not.
interface ReceivedVoice {
  sent: { name: string; id: ExactMessageId }[];
  checking: { name: string }[];
  failed: { name: string; reason: unknown }[];
}

function captionOf(field: string | undefined): string {
  return (field ?? "").replaceAll(/\r\n?/g, "\n").trim();
}

// A voice note recorded in the box goes into the room as a voice message, not as a file. It travels the receiver's
// files route of the signed-in account with the flag that names it a recording, so a chat service that carries voice
// messages receives it as one (the receiver's `docs/api.md`, 「Sends」); it is the account's own, as a typed word is.
// The recording is one file, and its words are its caption. It is read and sent on as a room's files are, held to no
// limit but the room's (docs/web.md, the room screen's input box).
export default defineEventHandler(async (event): Promise<SentMessage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);
  const speaker = await speakerOf(await signedInUser(event));
  const form = await spoolForm(event, "file", MAX_SAY_TEXT_LENGTH);

  try {
    return await sendVoice(chatId, speaker, form);
  } finally {
    await form.drop();
  }
});

async function sendVoice(chatId: number, speaker: Speaker, form: SpooledForm): Promise<SentMessage> {
  const caption = captionOf(form.fields.get("caption"));
  const file = form.files[0];

  if (file === undefined) {
    throw fail(400, wording("room.error.no_voice"));
  }

  if (caption.length > MAX_SAY_TEXT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_SAY_TEXT_LENGTH.toLocaleString("ko-KR") }));
  }

  if (file.size === 0) {
    throw fail(400, wording("room.error.file_empty_named", { name: file.name }));
  }

  const replyTo = replyToOf(form.fields.get("replyTo") ?? "");
  const fields: [string, string][] = [["text", caption], ["voice", "true"], ...(replyTo === null ? [] : [["replyTo", String(replyTo)] as [string, string]])];
  const watched = (): SentMessage => {
    throw fail(504, wording("room.status.checking"));
  };
  const key = sendKeyOf(form.fields.get("key") ?? "");

  return sendOnce<SentMessage>(
    chatId,
    key,
    async () => {
      const limit = roomLimitOnce(chatId);
      let answer: ReceivedVoice;

      try {
        answer = await sayRoomFiles<ReceivedVoice>(chatId, speaker, fields, [file]);
      } catch (error) {
        // A recording the receiver refused as past the room's limit is said with the limit.
        if ((error as { data?: { code?: unknown } | null }).data?.code === "too-large") throw fail(413, overLimitWords(file.name, await limit()));

        throw error;
      }

      const sent = answer.sent[0];

      if (sent !== undefined) {
        return { messageId: sent.id };
      }

      const failed = answer.failed[0];

      throw fail(502, failed === undefined ? wording("common.error.not_sent") : await unsentReason(failed, limit));
    },
    watched
  );
}
