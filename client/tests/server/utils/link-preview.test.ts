import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { globalsRestoredAfter } from "../../support/globals";

import { CARD_PICTURE_PIXELS, LinkPreviews } from "../../../apps/web/server/utils/link-preview";
import { roomLinkPicture, roomLinkPreviews } from "../../../apps/web/server/utils/room-links";
import { WebReadRefused } from "../../../apps/web/server/utils/web-read";

import type { PreviewReading } from "../../../apps/web/server/utils/link-preview";
import type { WebRead } from "../../../apps/web/server/utils/web-read";
import type { ExactMessageId } from "../../../apps/web/shared/types";

// A link card's page and picture as the server keeps them per address (docs/web.md, the link previews rule), and the cards
// of a room's message filled from them. The web is stood in by a table of answers, and the clock by a number.

const PAGE = "https://site.example/page";
const PICTURE = "https://cdn.example/picture.png";
const HTML = `<html><head><meta property="og:title" content="Page title"><meta property="og:description" content="Page description">
<meta property="og:site_name" content="Site"><meta property="og:image" content="${PICTURE}"></head></html>`;
const PNG = new Uint8Array(await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#3366aa" } }).png().toBuffer());

// A web of answers by address, each read counted, on a clock the test moves.
function standIn(answers: Record<string, WebRead | Error>) {
  const reads: string[] = [];
  let now = 0;
  const reading: PreviewReading = {
    open: null,
    now: () => now,
    read: async (address) => {
      reads.push(address);

      const answer = answers[address] ?? new WebReadRefused("no such page");

      if (answer instanceof Error) throw answer;

      return answer;
    }
  };

  return { reading, reads, move: (by: number) => (now += by) };
}

const page = (bytes: string, contentType = "text/html; charset=utf-8"): WebRead => ({ url: PAGE, contentType, bytes: new TextEncoder().encode(bytes) });
const picture = (contentType = "image/png"): WebRead => ({ url: PICTURE, contentType, bytes: PNG });

describe("LinkPreviews", () => {
  test("reads what the page declares, and an address asked again is not read again", async () => {
    const web = standIn({ [PAGE]: page(HTML) });
    const previews = new LinkPreviews(web.reading);

    expect(await previews.head(PAGE)).toEqual({ title: "Page title", description: "Page description", siteName: "Site", image: PICTURE });
    await previews.head(PAGE);
    expect(web.reads).toEqual([PAGE]);
  });

  test("shares one read among the asks made while it is under way", async () => {
    const web = standIn({ [PAGE]: page(HTML) });
    const previews = new LinkPreviews(web.reading);

    await Promise.all([previews.head(PAGE), previews.head(PAGE), previews.head(PAGE)]);
    expect(web.reads).toEqual([PAGE]);
  });

  test("answers nothing for a page that could not be read or is no page, and asks a failure again after a while", async () => {
    const web = standIn({ [PAGE]: new WebReadRefused("answered 500"), [PICTURE]: picture() });
    const previews = new LinkPreviews(web.reading);

    expect(await previews.head(PAGE)).toBeNull();
    expect(await previews.head(PICTURE)).toBeNull();

    web.move(14 * 60 * 1000);
    await previews.head(PAGE);
    expect(web.reads.filter((one) => one === PAGE)).toHaveLength(1);

    web.move(2 * 60 * 1000);
    await previews.head(PAGE);
    expect(web.reads.filter((one) => one === PAGE)).toHaveLength(2);
  });

  test("redraws the picture as the card's square", async () => {
    const previews = new LinkPreviews(standIn({ [PICTURE]: picture() }).reading);
    const drawn = (await previews.picture(PICTURE))!;
    const shape = await sharp(drawn.bytes).metadata();

    expect(drawn.type).toBe("image/webp");
    expect([shape.format, shape.width, shape.height]).toEqual(["webp", CARD_PICTURE_PIXELS, CARD_PICTURE_PIXELS]);
  });

  test("answers no picture for an answer of another type or bytes that are no picture", async () => {
    const previews = new LinkPreviews(standIn({ [PICTURE]: picture("image/svg+xml"), [PAGE]: { ...picture(), url: PAGE, bytes: new Uint8Array([1, 2, 3]) } }).reading);

    expect(await previews.picture(PICTURE)).toBeNull();
    expect(await previews.picture(PAGE)).toBeNull();
  });
});

describe("a room message's link cards", () => {
  const globals = globalThis as Record<string, unknown>;
  const PLAIN = "https://plain.example/";

  globalsRestoredAfter(["readOneMessage"]);
  globals.readOneMessage = async () => ({ messages: [{ text: `look at ${PAGE} and ${PLAIN}` }] });

  const web = () => standIn({ [PAGE]: page(HTML), [PICTURE]: picture() });
  const message = "5" as ExactMessageId;

  test("fills each card from its page, and leaves an address whose page could not be read plain", async () => {
    const cards = await roomLinkPreviews(1, message, new LinkPreviews(web().reading));

    expect(cards).toEqual([
      { index: 0, url: PAGE, host: "site.example", title: "Page title", description: "Page description", siteName: "Site", image: true },
      { index: 1, url: PLAIN, host: "plain.example", title: null, description: null, siteName: null, image: false }
    ]);
  });

  test("serves the picture the page at an address's place names, and none past the addresses or for a page naming none", async () => {
    const previews = new LinkPreviews(web().reading);

    expect((await roomLinkPicture(1, message, 0, previews))?.type).toBe("image/webp");
    expect(await roomLinkPicture(1, message, 1, previews)).toBeNull();
    expect(await roomLinkPicture(1, message, 2, previews)).toBeNull();
  });
});
