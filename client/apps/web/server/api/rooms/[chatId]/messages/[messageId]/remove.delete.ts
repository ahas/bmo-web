import { acted, messageToActOn } from "../../../../../utils/message-acts";
import { exactAnswer, receiver, wireId } from "../../../../../utils/receiver";

import type { ReceiverMessage } from "../../../../../utils/receiver";
import type { MessageAct } from "#shared/types";

// The signed-in person's own message deleted, or the administrator's on any message (the receiver's `docs/api.md`,
// 「Messages」): the record clears its words and keeps the place it stood in, and the room's screens read that one
// message again. The message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);

  const message = await exactAnswer<ReceiverMessage>(
    receiver().DELETE("/rooms/{roomId}/messages/{messageId}", {
      params: { path: { roomId: acted_.chatId, messageId: wireId(acted_.messageId) } },
      parseAs: "text",
      headers: acted_.headers
    })
  );

  return acted(message);
});
