import { ownerHeaders } from "./owner-key";
import { requireWritableRoom } from "./room-reach";

import type { ExactMessageId, MessageAct } from "#shared/types";
import type { H3Event } from "h3";

// What every act a signed-in person does to a message begins with: the person, the room they must be able to change,
// the message, and the headers the receiver takes the person by (its `docs/api.md`, 「Messages」). The receiver reads
// the login's senders from the user the key names and keeps the act under the one the room already holds, so nothing
// in a body says who acts.
export interface ActedMessage {
  chatId: number;
  messageId: ExactMessageId;
  headers: Record<string, string>;
}

export async function messageToActOn(event: H3Event): Promise<ActedMessage> {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireWritableRoom(event, chatId);

  return { chatId, messageId: requireMessageId(event), headers: ownerHeaders(signed) };
}

// The number of the message an act answered with. The receiver answers the message as it now stands, and the screen
// reads that row again through the same path the record's `message-changed` news takes, so an act is never drawn from
// what the browser sent.
export function acted(message: { id: ExactMessageId }): MessageAct {
  return { messageId: message.id };
}
