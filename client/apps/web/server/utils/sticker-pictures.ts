import sharp from "sharp";

import type { Sharp } from "sharp";

import type { StickerFrames } from "#shared/sticker-frames";

// A sticker's picture as it goes out (docs/web.md, the room screen's wordless messages). A browser plays a moving picture as many times
// as its file says, and a KakaoTalk emoticon says a few, so a moving WebP or GIF whose count is finite is written
// again with the count set to forever, its frames and their timing as they came: a WebP losslessly, so its frames
// stay as they were decoded, and a GIF on the palette it came with. Asked to stand still, a picture goes out as its
// first frame alone. The image library reads a picture's format, its frames and its loop count; it reads only the
// first frame of an APNG, so an APNG keeps the count its file holds.

// What a picture is written as.
interface Written {
  bytes: Uint8Array<ArrayBuffer>;
  type: string;
}

/**
 * A sticker picture the console is handing on, with the frames asked for. A picture that already plays as asked, and
 * one the image library cannot read, goes on as it came; a written one is answered whole, with no stretch to seek.
 */
export async function framedPicture(answer: Response, frames: StickerFrames): Promise<Response> {
  if (!answer.ok) return answer;

  const bytes = new Uint8Array(await answer.arrayBuffer());
  const written = await rewritten(bytes, frames).catch(() => null);

  if (written === null) return new Response(bytes, { status: answer.status, headers: answer.headers });

  const headers = new Headers(answer.headers);

  headers.delete("accept-ranges");
  headers.delete("content-range");
  headers.set("content-type", written.type);
  headers.set("content-length", String(written.bytes.byteLength));

  return new Response(written.bytes, { status: 200, headers });
}

// The picture written to play as asked, or null where it already does.
async function rewritten(bytes: Uint8Array, frames: StickerFrames): Promise<Written | null> {
  if (frames === "still") return { bytes: await bytesOf(sharp(bytes).png()), type: "image/png" };

  const { format, pages = 1, loop = 0 } = await sharp(bytes, { animated: true }).metadata();

  if (pages <= 1 || loop === 0) return null;

  const moving = sharp(bytes, { animated: true });

  switch (format) {
    case "webp":
      return { bytes: await bytesOf(moving.webp({ loop: 0, lossless: true })), type: "image/webp" };
    case "gif":
      return { bytes: await bytesOf(moving.gif({ loop: 0, reuse: true })), type: "image/gif" };
    default:
      return null;
  }
}

// The bytes the image library wrote, as a body a response takes.
async function bytesOf(image: Sharp): Promise<Uint8Array<ArrayBuffer>> {
  return Uint8Array.from(await image.toBuffer());
}
