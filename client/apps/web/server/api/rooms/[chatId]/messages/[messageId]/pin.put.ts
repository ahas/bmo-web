import { wording } from "#shared/wording";

import { acted, actOnMessage, messageToActOn } from "../../../../../utils/message-acts";

import type { MessageAct } from "#shared/types";

// A message pinned to the room, or its pin taken off (the receiver's `docs/api.md`, 「Messages」): anyone signed in
// sets or takes a pin off, and the record keeps the moment it was pinned. The message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);
  const body = await readBody<{ on?: unknown }>(event);

  if (typeof body?.on !== "boolean") {
    throw fail(400, wording("room.error.pin_message_direction"));
  }

  const message = await actOnMessage(acted_, "PUT", "/pin", { on: body.on });

  return acted(message);
});
