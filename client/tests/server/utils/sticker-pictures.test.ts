import { describe, expect, test } from "bun:test";

import sharp from "sharp";

// A sticker's picture on its way out (docs/web.md, the room screen's wordless messages): what is handed on exactly as it came. That a
// moving picture is served looping forever, and as its first frame for less movement, is read in the browser by
// tests/browser/room-stickers.test.ts.

const { framedPicture } = await import("../../../apps/web/server/utils/sticker-pictures");

// Two frames of a 4px square, as a moving WebP that loops forever.
const frame = (colour: string) => sharp({ create: { width: 4, height: 4, channels: 3, background: colour } }).png().toBuffer();
const LOOPING = await sharp([await frame("#36a"), await frame("#a63")], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();

const answered = (bytes: Uint8Array, type: string) => new Response(Uint8Array.from(bytes), { headers: { "content-type": type, "content-length": String(bytes.byteLength) } });

describe("a sticker's picture asked to loop", () => {
  test("goes on as it came where it already loops forever, or cannot be read", async () => {
    const unreadable = new TextEncoder().encode("not a picture");

    for (const [bytes, type] of [[LOOPING, "image/webp"], [unreadable, "image/webp"]] as const) {
      const out = await framedPicture(answered(bytes, type), "loop");

      expect(new Uint8Array(await out.arrayBuffer())).toEqual(Uint8Array.from(bytes));
      expect(out.headers.get("content-type")).toBe(type);
    }
  });

  test("goes on as the refusal it was", async () => {
    const refused = new Response("gone", { status: 404 });

    expect(await framedPicture(refused, "loop")).toBe(refused);
  });
});
