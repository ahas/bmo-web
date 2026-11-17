import { describe, expect, test } from "bun:test";

import sharp from "sharp";

// A sticker's picture on its way out (docs/web.md, the room screen's wordless messages): what is handed on exactly as
// it came, and the only bytes an APNG's loop changes. That a moving picture is served looping forever, and as its
// first frame for less movement, is read in the browser by tests/browser/room-stickers.test.ts.

const { framedPicture } = await import("../../../apps/web/server/utils/sticker-pictures");

// Two frames of a 4px square, as a moving WebP that loops forever.
const frame = (colour: string) => sharp({ create: { width: 4, height: 4, channels: 3, background: colour } }).png().toBuffer();
const LOOPING = await sharp([await frame("#36a"), await frame("#a63")], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();

// An APNG of three frames that plays once, as the browser test's room keeps it.
const APNG_ONCE = new Uint8Array(await Bun.file(new URL("../../support/room-sticker-once.png", import.meta.url)).arrayBuffer());

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

describe("an APNG asked to loop", () => {
  // Where the animation control's play count and its chunk's checksum stand: the count is the control's second field,
  // and the checksum follows its eight bytes of data.
  const control = (bytes: Uint8Array) => {
    const at = Buffer.from(bytes).indexOf("acTL");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    return { plays: view.getUint32(at + 8), changeable: [at + 8, at + 9, at + 10, at + 11, at + 12, at + 13, at + 14, at + 15] };
  };

  test("plays forever, every byte but its play count and that chunk's checksum as it came", async () => {
    const out = new Uint8Array(await (await framedPicture(answered(APNG_ONCE, "image/png"), "loop")).arrayBuffer());
    const { plays, changeable } = control(APNG_ONCE);
    const changed = [...out.keys()].filter((at) => out[at] !== APNG_ONCE[at]);

    expect(plays).toBe(1);
    expect(control(out).plays).toBe(0);
    expect(out.byteLength).toBe(APNG_ONCE.byteLength);
    expect(changed.every((at) => changeable.includes(at))).toBe(true);
  });

  test("goes on as it came where it already plays forever", async () => {
    const looping = new Uint8Array(await (await framedPicture(answered(APNG_ONCE, "image/png"), "loop")).arrayBuffer());
    const again = new Uint8Array(await (await framedPicture(answered(looping, "image/png"), "loop")).arrayBuffer());

    expect(again).toEqual(looping);
  });
});
