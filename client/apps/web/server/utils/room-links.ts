import { messageLinks } from "#shared/links";

import type { ExactMessageId, LinkPreview } from "#shared/types";

// The addresses a room's message carries, as the receiver holds its words. A preview is only ever asked for by the
// message and the place of the address in it, so this server names nothing a room did not say.
async function linksOf(chatId: number, messageId: ExactMessageId): Promise<string[]> {
  const message = (await readOneMessage(chatId, messageId)).messages[0];

  return message === undefined ? [] : messageLinks(message.text ?? "");
}

// What each address of one message shows of itself. Reading a page for its title, description and picture is no
// unit's to serve the console yet (docs/boundary.md, 「Gaps the console meets」), so every address stands with nothing
// but where it goes, and the card the screen draws for it is a plain link.
export async function roomLinkPreviews(chatId: number, messageId: ExactMessageId): Promise<LinkPreview[]> {
  return (await linksOf(chatId, messageId)).map((url, index) => ({
    index,
    url,
    host: new URL(url).hostname.replace(/^www\./, ""),
    title: null,
    description: null,
    siteName: null,
    image: false
  }));
}
