import { MAX_SAY_TEXT_LENGTH } from "#shared/config";
import { wording } from "#shared/wording";

import { jsonMessageId } from "../../../utils/exact-json";
import { exactAnswer, receiver } from "../../../utils/receiver";

import type { SentMessage } from "#shared/types";

interface SayBody {
  text?: unknown;
  // The number of the message this answers, when it is a reply.
  replyTo?: unknown;
  // The key the screen put on this send, the same on every try of it (docs/web.md, the room screen's section on a send going once).
  key?: unknown;
}

// What the owner types here is said in the room under their own name, through the receiver (the receiver's
// `docs/boundary-api.md`, `POST /say`). From there it is an ordinary message: the receiver keeps it and the room's
// agent answers it.
export default defineEventHandler(async (event): Promise<SentMessage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);
  const body = await readBody<SayBody>(event);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (text === "") {
    throw fail(400, wording("room.error.say_empty"));
  }

  if (text.length > MAX_SAY_TEXT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_SAY_TEXT_LENGTH.toLocaleString("ko-KR") }));
  }

  const replyTo = replyToOf(body?.replyTo);

  // The receiver's refusal of a reply — a message it cannot find — is said by the pack's sentence for its code. The
  // send waits for the receiver's answer however long the road takes, and what it came to is written under its
  // key; a try of a send still going under its key comes back as a 504, which the screen checks rather than
  // calling it failed.
  return sendOnce<SentMessage>(
    chatId,
    sendKeyOf(body?.key),
    async () => {
      const said = await exactAnswer<{ id: number }>(
        receiver().POST("/owner/messages", {
          body: { chatId, text, replyTo: replyTo === null ? null : jsonMessageId(replyTo) },
          parseAs: "text"
        })
      );

      return { messageId: said.id };
    },
    () => {
      throw fail(504, wording("room.status.checking"));
    }
  );
});
