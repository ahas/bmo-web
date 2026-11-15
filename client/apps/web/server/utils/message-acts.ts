import { ownerHeaders } from "./owner-key";
import { MESSAGE_IDS, receiverRoute } from "./receiver";
import { requireWritableRoom } from "./room-reach";

import type { ExactMessage } from "./receiver";
import type { ExactMessageId, MessageAct } from "#shared/types";
import type { H3Event } from "h3";

// What every act a signed-in person does to a message begins with: the person, the room they must be able to change,
// the message, and what the receiver takes the person by (its `docs/api.md`, 「Messages」): the headers whose user it
// reads the login's senders from, keeping the act under the one the room already holds, and the account the act is
// made as, which it refuses in a room that is another account's private room. Nothing the browser sends says who acts.
export interface ActedMessage {
  chatId: number;
  messageId: ExactMessageId;
  headers: Record<string, string>;
  // The signed-in account; none for a console login standing before the account model, which has no account.
  account: number | null;
}

export async function messageToActOn(event: H3Event): Promise<ActedMessage> {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);
  const messageId = requireMessageId(event);

  await requireWritableRoom(event, chatId);

  return { chatId, messageId, headers: ownerHeaders(signed), account: signed.id };
}

// A refusal of a change in another account's private room, 403 `private-room`, is said as the refusal it is.
const CHANGES = { passStatus: [403], exactIds: MESSAGE_IDS };

/**
 * An act on the message asked of the receiver: the method, the act's route below the message, and its body, with the
 * acting account beside the body, or in the query of an act that carries none. The published client names no account
 * on these routes, so each is asked on its address (docs/boundary.md, 「Gaps the console meets」). The message answers
 * as it now stands, its ids exact.
 */
export async function actOnMessage(acted_: ActedMessage, method: "PUT" | "PATCH" | "DELETE", route: string, body?: Record<string, unknown>): Promise<ExactMessage> {
  const account = acted_.account === null ? {} : { account: acted_.account };
  const path = `/rooms/${acted_.chatId}/messages/${acted_.messageId}${route}`;

  if (method === "DELETE") {
    const query = acted_.account === null ? "" : `?account=${acted_.account}`;

    return await receiverRoute<ExactMessage>(`${path}${query}`, { method, headers: acted_.headers }, CHANGES);
  }

  return await receiverRoute<ExactMessage>(path, { method, headers: acted_.headers, body: { ...body, ...account } }, CHANGES);
}

// The number of the message an act answered with. The receiver answers the message as it now stands, and the screen
// reads that row again through the same path the record's `message-changed` news takes, so an act is never drawn from
// what the browser sent.
export function acted(message: { id: ExactMessageId }): MessageAct {
  return { messageId: message.id };
}
