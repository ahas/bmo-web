import type { ExactMessageId, ForwardedMessage, MessageAct, PinnedMessage, RoomPins, SentMessage, StickerSet } from "#shared/types";
import type { FeedItem } from "./room";

// What the signed-in reader does to a message of a room's, through this app's server (the receiver's `docs/api.md`,
// 「Messages」): a reaction of their own, a pin, an edit of their own message, a delete of it, and a sticker sent into
// the room as a message of theirs. Each act answers the message it stood on by its number, and the screen reads that
// row again rather than drawing the act from what it sent (docs/web.md, the room screen's message menu).

// The emojis the console offers for a reaction. The receiver keeps any emoji it is given, so the list is the console's
// own choice of the ones people reach for; it is a list of emojis, not of words, and holds no meaning of its own.
export const REACTION_EMOJIS: readonly string[] = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

/** The emoji one of the reader's own senders has put on this message, where one stands: the record keeps one reaction
 * to a reactor, so a second replaces the first. */
export function mineReaction(item: Pick<FeedItem, "reactions">): string | null {
  return item.reactions?.find((reaction) => reaction.mine)?.emoji ?? null;
}

/** The reader's reaction put on a message, or the one they had taken off. */
export async function reactTo(chatId: number, messageId: ExactMessageId, emoji: string, on: boolean): Promise<MessageAct> {
  const path = `/api/rooms/${chatId}/messages/${messageId}/reaction`;

  return on
    ? await $fetch<MessageAct>(path, { method: "PUT", body: { emoji } })
    : await $fetch<MessageAct>(path, { method: "DELETE" });
}

/** A message pinned to the room, or its pin taken off. */
export async function pinMessage(chatId: number, messageId: ExactMessageId, on: boolean): Promise<MessageAct> {
  return await $fetch<MessageAct>(`/api/rooms/${chatId}/messages/${messageId}/pin`, { method: "PUT", body: { on } });
}

/** The reader's own message edited to the words given. */
export async function editMessage(chatId: number, messageId: ExactMessageId, text: string): Promise<MessageAct> {
  return await $fetch<MessageAct>(`/api/rooms/${chatId}/messages/${messageId}/edit`, { method: "PATCH", body: { text } });
}

/** A message deleted, the reader's own or any the administrator names. */
export async function deleteMessage(chatId: number, messageId: ExactMessageId): Promise<MessageAct> {
  return await $fetch<MessageAct>(`/api/rooms/${chatId}/messages/${messageId}/remove`, { method: "DELETE" });
}

/** The owner's copy of a message in another room, marked with where it came from. */
export async function forwardMessage(chatId: number, messageId: ExactMessageId, to: number): Promise<ForwardedMessage> {
  return await $fetch<ForwardedMessage>(`/api/rooms/${chatId}/messages/${messageId}/forward`, { method: "POST", body: { to } });
}

/** A sticker of the record's set sent into the room as the reader's own message. */
export async function sendSticker(chatId: number, emoji: string): Promise<SentMessage> {
  return await $fetch<SentMessage>(`/api/rooms/${chatId}/stickers`, { method: "POST", body: { emoji } });
}

/** The stickers the record keeps, each by its emoji. */
export async function readStickers(chatId: number): Promise<string[]> {
  return (await $fetch<StickerSet>(`/api/rooms/${chatId}/stickers`)).items;
}

/** The room's pinned messages, newest pin first. */
export async function readPins(chatId: number): Promise<PinnedMessage[]> {
  return (await $fetch<RoomPins>(`/api/rooms/${chatId}/pins`)).items;
}
