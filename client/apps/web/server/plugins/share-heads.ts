import { withoutBase } from "ufo";

import { spokenLanguage } from "#shared/wording";

import { askedShareHead, shareAddressOf, shareHeadTags } from "../utils/share-heads";

import type { H3Event } from "h3";

// A share page goes out with its card's head (docs/web.md, 「Screens a unit brings」): the shell the server serves at a
// bundle's share address carries the tags of the head its unit answers, and every other page goes out as it is.

/** The language the console shows the page in, which a share head is asked in: the reader's language's primary
 * subtag. */
export function shareHeadLanguage(): string {
  return spokenLanguage().split("-")[0]!;
}

/** What the renderer hands the hook: the head's chunks, which the tags are added to. */
export interface RenderedHtml {
  head: string[];
}

/** Writes a share address's head into the page being rendered, and leaves any other page, or one whose head does not
 * answer, as it is. */
export async function writeShareHead(html: RenderedHtml, event: Pick<H3Event, "path">, baseURL: string): Promise<void> {
  const address = shareAddressOf(withoutBase(event.path.split("?")[0] ?? "", baseURL));

  if (address === null) return;

  const head = await askedShareHead(address, shareHeadLanguage());

  if (head !== null) html.head.push(shareHeadTags(head, address.bundle, baseURL).join(""));
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("render:html", (html, { event }) => writeShareHead(html, event, useRuntimeConfig(event).app.baseURL));
});
