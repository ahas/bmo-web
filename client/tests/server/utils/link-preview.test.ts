import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { CARD_PICTURE_PIXELS, LinkPreviews } from "../../../apps/web/server/utils/link-preview";
import { roomLinkPicture, roomLinkPreviews } from "../../../apps/web/server/utils/room-links";
import { HostedToolFailed } from "../../../apps/web/server/utils/tool-host";

import type { PreviewReading } from "../../../apps/web/server/utils/link-preview";
import type { ToolResult } from "../../../apps/web/server/utils/tool-host";
import type { ExactMessageId } from "../../../apps/web/shared/types";

// A link card's page and picture as the server reads them through bmo-explorer's entries and keeps them per address
// (docs/web.md, the link previews rule), and the cards of a room's message filled from them. The tool host is stood
// in by a table of answers by entry and address, and the clock by a number.

const PAGE = "https://site.example/page";
const PICTURE = "https://cdn.example/picture.png";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const HEAD = { url: PAGE, title: "Page title", description: "Page description", siteName: "Site", image: PICTURE };

const preview = (answer: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: "preview" }], structuredContent: answer });
const raster = (bytes: Uint8Array, mimeType = "image/jpeg"): ToolResult => ({ content: [{ type: "image", data: Buffer.from(bytes).toString("base64"), mimeType }] });

// A tool host of answers by entry and address, each call counted with what it was handed and how long it was waited
// on, on a clock the test moves.
function standIn(answers: Record<string, ToolResult | Error>) {
  const calls: { entry: string; input: Record<string, unknown>; waitMs: number }[] = [];
  let now = 0;
  const reading: PreviewReading = {
    now: () => now,
    call: async (tool, input, waitMs) => {
      const entry = `${tool.namespace}/${tool.name}`;

      calls.push({ entry, input, waitMs });

      const answer = answers[`${entry} ${String(input.address)}`] ?? new HostedToolFailed("upstream-failed");

      if (answer instanceof Error) throw answer;

      return answer;
    }
  };

  return { reading, calls, move: (by: number) => (now += by) };
}

const pageOf = (answer: ToolResult | Error) => ({ [`explorer/link_preview ${PAGE}`]: answer });
const pictureOf = (answer: ToolResult | Error) => ({ [`explorer/fetch_raster ${PICTURE}`]: answer });

describe("LinkPreviews", () => {
  test("reads what the link preview entry answers within the page's wait, and an address asked again is not read again", async () => {
    const host = standIn(pageOf(preview(HEAD)));
    const previews = new LinkPreviews(host.reading);

    expect(await previews.head(PAGE)).toEqual({ title: "Page title", description: "Page description", siteName: "Site", image: PICTURE });
    await previews.head(PAGE);
    expect(host.calls).toEqual([{ entry: "explorer/link_preview", input: { address: PAGE, pacing: "link-cards" }, waitMs: 5_000 }]);
  });

  test("stands null for each field the page declares nothing for", async () => {
    const previews = new LinkPreviews(standIn(pageOf(preview({ url: PAGE, title: "Only a title", description: null }))).reading);

    expect(await previews.head(PAGE)).toEqual({ title: "Only a title", description: null, siteName: null, image: null });
  });

  test("shares one read among the asks made while it is under way", async () => {
    const host = standIn(pageOf(preview(HEAD)));
    const previews = new LinkPreviews(host.reading);

    await Promise.all([previews.head(PAGE), previews.head(PAGE), previews.head(PAGE)]);
    expect(host.calls).toHaveLength(1);
  });

  test("answers nothing for a page the call failed on, and asks a failure again after a while", async () => {
    const host = standIn(pageOf(new HostedToolFailed("upstream-failed")));
    const previews = new LinkPreviews(host.reading);

    expect(await previews.head(PAGE)).toBeNull();

    host.move(14 * 60 * 1000);
    await previews.head(PAGE);
    expect(host.calls).toHaveLength(1);

    host.move(2 * 60 * 1000);
    await previews.head(PAGE);
    expect(host.calls).toHaveLength(2);
  });

  test("asks the picture entry for the card's square within the picture's wait, and serves the bytes it answers", async () => {
    const host = standIn(pictureOf(raster(JPEG)));
    const drawn = await new LinkPreviews(host.reading).picture(PICTURE);

    expect(drawn).toEqual({ bytes: JPEG, type: "image/jpeg" });
    expect(host.calls).toEqual([{ entry: "explorer/fetch_raster", input: { address: PICTURE, pacing: "link-cards", square: CARD_PICTURE_PIXELS }, waitMs: 8_000 }]);
  });

  test("answers no picture where the call fails or its answer carries no picture", async () => {
    const failed = new LinkPreviews(standIn(pictureOf(new HostedToolFailed("too large"))).reading);
    const wordsOnly = new LinkPreviews(standIn(pictureOf({ content: [{ type: "text", text: "no picture" }] })).reading);

    expect(await failed.picture(PICTURE)).toBeNull();
    expect(await wordsOnly.picture(PICTURE)).toBeNull();
  });
});

describe("a room message's link cards", () => {
  const globals = globalThis as Record<string, unknown>;
  const PLAIN = "https://plain.example/";

  globalsRestoredAfter(["readOneMessage"]);
  globals.readOneMessage = async () => ({ messages: [{ text: `look at ${PAGE} and ${PLAIN}` }] });

  const web = () => standIn({ ...pageOf(preview(HEAD)), ...pictureOf(raster(JPEG)) });
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

    expect((await roomLinkPicture(1, message, 0, previews))?.type).toBe("image/jpeg");
    expect(await roomLinkPicture(1, message, 1, previews)).toBeNull();
    expect(await roomLinkPicture(1, message, 2, previews)).toBeNull();
  });
});
