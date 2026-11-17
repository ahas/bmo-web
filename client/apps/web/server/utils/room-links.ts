import { messageLinks } from "#shared/links";

import { linkPreviews } from "./link-preview";

import type { CardPicture, LinkPreviews } from "./link-preview";
import type { ExactMessageId, LinkPreview } from "#shared/types";

// The addresses a room's message carries, as the receiver holds its words. A preview is only ever asked for by the
// message and the place of the address in it, so this server reads no page a room did not link to.
async function linksOf(chatId: number, messageId: ExactMessageId): Promise<string[]> {
  const message = (await readOneMessage(chatId, messageId)).messages[0];

  return message === undefined ? [] : messageLinks(message.text ?? "");
}

/** What each address of one message shows of itself (docs/web.md, the link previews rule): what its page's head declares,
 * or nothing but where it goes where the page could not be read. */
export async function roomLinkPreviews(
  chatId: number,
  messageId: ExactMessageId,
  previews: LinkPreviews = linkPreviews()
): Promise<LinkPreview[]> {
  const links = await linksOf(chatId, messageId);
  const heads = await Promise.all(links.map((url) => previews.head(url)));

  return links.map((url, index) => {
    const head = heads[index] ?? null;

    return {
      index,
      url,
      host: new URL(url).hostname.replace(/^www\./, ""),
      title: head?.title ?? null,
      description: head?.description ?? null,
      siteName: head?.siteName ?? null,
      image: (head?.image ?? null) !== null
    };
  });
}

/** The picture the page of one address of a message names, as the card draws it; null where it names none or the
 * picture could not be read. */
export async function roomLinkPicture(
  chatId: number,
  messageId: ExactMessageId,
  index: number,
  previews: LinkPreviews = linkPreviews()
): Promise<CardPicture | null> {
  const url = (await linksOf(chatId, messageId))[index];

  if (url === undefined) return null;

  const image = (await previews.head(url))?.image ?? null;

  return image === null ? null : previews.picture(image);
}
