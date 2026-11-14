import { wording } from "#shared/wording";

import { acted, messageToActOn } from "../../../../../utils/message-acts";
import { exactAnswer, receiver } from "../../../../../utils/receiver";

import type { ReceiverMessage } from "../../../../../utils/receiver";
import type { MessageAct } from "#shared/types";

// A reaction of the signed-in person's own put on a message (the receiver's `docs/api.md`, 「Messages」): the emoji is
// kept under the sender the room knows them by, one reaction to a reactor. The answer is the message it now stands as,
// by its number, and the screen reads that row again.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);
  const body = await readBody<{ emoji?: unknown }>(event);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";

  if (emoji === "") {
    throw fail(400, wording("room.error.reaction_empty"));
  }

  const message = await exactAnswer<ReceiverMessage>(
    receiver().PUT("/rooms/{roomId}/messages/{messageId}/reactions/mine", {
      params: { path: { roomId: acted_.chatId, messageId: acted_.messageId } },
      parseAs: "text",
      body: { emoji },
      headers: acted_.headers
    })
  );

  return acted(message);
});
