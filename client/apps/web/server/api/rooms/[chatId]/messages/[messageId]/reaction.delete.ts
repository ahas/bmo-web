import { acted, actOnMessage, messageToActOn } from "../../../../../utils/message-acts";

import type { MessageAct } from "#shared/types";

// The signed-in person's own reaction taken off a message (the receiver's `docs/api.md`, 「Messages」): the emoji they
// put there is taken off, and the message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);

  const message = await actOnMessage(acted_, "DELETE", "/reactions/mine");

  return acted(message);
});
