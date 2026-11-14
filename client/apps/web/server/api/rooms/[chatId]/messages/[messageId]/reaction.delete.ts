import { acted, messageToActOn } from "../../../../../utils/message-acts";
import { exactAnswer, receiver, wireId } from "../../../../../utils/receiver";

import type { ReceiverMessage } from "../../../../../utils/receiver";
import type { MessageAct } from "#shared/types";

// The signed-in person's own reaction taken off a message (the receiver's `docs/api.md`, 「Messages」): the emoji they
// put there is taken off, and the message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);

  const message = await exactAnswer<ReceiverMessage>(
    receiver().DELETE("/rooms/{roomId}/messages/{messageId}/reactions/mine", {
      params: { path: { roomId: acted_.chatId, messageId: wireId(acted_.messageId) } },
      parseAs: "text",
      headers: acted_.headers
    })
  );

  return acted(message);
});
