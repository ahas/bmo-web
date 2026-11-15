import { MAX_SAY_TEXT_LENGTH } from "#shared/config";
import { wording } from "#shared/wording";

import { acted, actOnMessage, messageToActOn } from "../../../../../utils/message-acts";

import type { MessageAct } from "#shared/types";

// The signed-in person's own message edited (the receiver's `docs/api.md`, 「Messages」): the words are kept in place
// with the moment they changed, and the message keeps its number and its place in the room's line. A message the
// person's senders did not say is the receiver's to refuse. The message answers as it now stands.
export default defineEventHandler(async (event): Promise<MessageAct> => {
  const acted_ = await messageToActOn(event);
  const body = await readBody<{ text?: unknown }>(event);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (text === "") {
    throw fail(400, wording("room.error.edit_empty"));
  }

  if (text.length > MAX_SAY_TEXT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_SAY_TEXT_LENGTH.toLocaleString("ko-KR") }));
  }

  const message = await actOnMessage(acted_, "PATCH", "", { text });

  return acted(message);
});
