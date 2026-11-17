import { crc32 } from "node:zlib";

import sharp from "sharp";

import type { Sharp } from "sharp";

import type { StickerFrames } from "#shared/sticker-frames";

// A sticker's picture as it goes out (docs/web.md, the room screen's wordless messages). A browser plays a moving picture as many times
// as its file says, and a KakaoTalk emoticon says a few, so a moving WebP or GIF whose count is finite is written
// again with the count set to forever, its frames and their timing as they came: a WebP losslessly, so its frames
// stay as they were decoded, and a GIF on the palette it came with. An APNG keeps every byte but its play count.
// Asked to stand still, a picture goes out as its first frame alone. The image library reads a picture's format, its
// frames and its loop count, but only the first frame of an APNG.

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

  if (format === "png") {
    const looped = loopedApng(bytes);

    return looped === null ? null : { bytes: looped, type: "image/png" };
  }

  if (pages <= 1 || loop === 0) return null;

  const moving = sharp(bytes, { animated: true });

  switch (format) {
    case "webp":
      // The encoder's lowest search but one: a KakaoTalk emoticon is written in about a third of the default's time,
      // under a second at the slowest, at the same size, since the picture waits on it the first time it is read.
      return { bytes: await bytesOf(moving.webp({ loop: 0, lossless: true, effort: 1 })), type: "image/webp" };
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

// An APNG's play count is the second field of its animation control chunk, `acTL`, which stands before the image data:
// four bytes of frame count, then four of plays, 0 for forever (the APNG specification, 「acTL」). No package the
// console carries reads APNG chunks, and the image library sees an APNG as its first frame alone, so the one field is
// set in place and the chunk's CRC-32 over its type and data written again with the runtime's own; every other byte
// stays as it came.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHUNK_HEAD = 8;
const CHUNK_TAIL = 4;
const ANIMATION_CONTROL_LENGTH = 8;

/** An APNG with its play count set to forever, or null where the bytes hold no animation control or already loop. */
function loopedApng(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (!PNG_SIGNATURE.every((byte, at) => bytes[at] === byte)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let at = PNG_SIGNATURE.length; at + CHUNK_HEAD + CHUNK_TAIL <= bytes.byteLength; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + CHUNK_HEAD));
    const data = at + CHUNK_HEAD;

    if (type === "IDAT" || type === "IEND") return null;

    if (type === "acTL") {
      if (length !== ANIMATION_CONTROL_LENGTH || data + length + CHUNK_TAIL > bytes.byteLength || view.getUint32(data + 4) === 0) {
        return null;
      }

      const looped = Uint8Array.from(bytes);
      const edit = new DataView(looped.buffer);

      edit.setUint32(data + 4, 0);
      edit.setUint32(data + length, crc32(looped.subarray(at + 4, data + length)));

      return looped;
    }

    at = data + length + CHUNK_TAIL;
  }

  return null;
}
