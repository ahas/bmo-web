import { wording } from "#shared/wording";

import { acted, messageToActOn } from "../../../../../utils/message-acts";
import { exactAnswer, receiver } from "../../../../../utils/receiver";

import type { ReceiverMessage } from "../../../../../utils/receiver";
import type { MessageAct } from "#shared/types";

// A message pinned to the room, or its pin taken off (the receiver's `docs/api.md`, 「Messages」): anyone signed in
// sets or takes a pin off, and the record keeps the moment it was pinned. The message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);
  const body = await readBody<{ on?: unknown }>(event);

  if (typeof body?.on !== "boolean") {
    throw fail(400, wording("room.error.pin_message_direction"));
  }

  const message = await exactAnswer<ReceiverMessage>(
    receiver().PUT("/rooms/{roomId}/messages/{messageId}/pin", {
      params: { path: { roomId: acted_.chatId, messageId: acted_.messageId } },
      parseAs: "text",
      body: { on: body.on },
      headers: acted_.headers
    })
  );

  return acted(message);
});
