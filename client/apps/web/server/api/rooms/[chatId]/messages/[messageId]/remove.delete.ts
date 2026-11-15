import { acted, actOnMessage, messageToActOn } from "../../../../../utils/message-acts";

import type { MessageAct } from "#shared/types";

// The signed-in person's own message deleted, or the administrator's on any message (the receiver's `docs/api.md`,
// 「Messages」): the record clears its words and keeps the place it stood in, and the room's screens read that one
// message again. The message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);

  const message = await actOnMessage(acted_, "DELETE", "");

  return acted(message);
});
