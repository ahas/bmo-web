import sharp from "sharp";

import type { PictureBytes } from "./account-service";

// The copy of a picture the console draws small (docs/web.md, 「A picture drawn small」): shrunk with a Lanczos kernel
// to a step of the ladder the address asks for, so the browser's own shrink of it is a small one. A copy is made
// once and the latest are kept in memory within a bound; one being made is waited on rather than made twice.

/** How a copy is cut: a profile photo to the square its circle shows, a message's picture to its own shape. */
export type DrawnCut = "square" | "shape";

// How many bytes of copies are kept; the oldest goes first.
const KEPT_BYTES = 64 * 1024 * 1024;
// How hard a copy is squeezed: enough that a face and a photograph keep their detail at the size they are drawn.
const QUALITY = 86;

const kept = new Map<string, PictureBytes>();
const making = new Map<string, Promise<PictureBytes>>();
let keptBytes = 0;

/**
 * The picture as it is drawn at a step's width. `key` names the picture and the moment it was kept, so a copy is never
 * served for a picture that has changed since; a picture already narrower than the step, one with more than one frame
 * and one the image library cannot read come back as they were.
 */
export async function drawnCopy(key: string, original: PictureBytes, width: number, cut: DrawnCut): Promise<PictureBytes> {
  const name = `${cut}/${width}/${key}`;
  const known = kept.get(name);

  if (known !== undefined) {
    // Read again, it goes to the back of the line to be let go.
    kept.delete(name);
    kept.set(name, known);
    return known;
  }

  const under = making.get(name);

  if (under !== undefined) return under;

  const made = shrunk(original, width, cut)
    .catch(() => original)
    .finally(() => making.delete(name));

  making.set(name, made);

  const copy = await made;

  if (copy !== original) keep(name, copy);

  return copy;
}

async function shrunk(original: PictureBytes, width: number, cut: DrawnCut): Promise<PictureBytes> {
  const { width: across, height: down, pages = 1, orientation } = await sharp(original.bytes).metadata();

  if (across === undefined || down === undefined || pages > 1) return original;

  // A picture turned a quarter by its orientation stands with its width and height swapped.
  const turned = orientation !== undefined && orientation >= 5;
  const standing = { width: turned ? down : across, height: turned ? across : down };
  const fits = cut === "square" ? Math.min(standing.width, standing.height) : standing.width;

  if (fits <= width) return original;

  const picture = sharp(original.bytes).rotate();
  const sized = cut === "square" ? picture.resize(width, width, { fit: "cover", position: "centre" }) : picture.resize({ width });
  const bytes = await sized.webp({ quality: QUALITY }).toBuffer();

  return { bytes: new Uint8Array(bytes), type: "image/webp" };
}

function keep(name: string, copy: PictureBytes): void {
  if (copy.bytes.byteLength > KEPT_BYTES) return;

  kept.set(name, copy);
  keptBytes += copy.bytes.byteLength;

  for (const [oldest, gone] of kept) {
    if (keptBytes <= KEPT_BYTES) break;

    kept.delete(oldest);
    keptBytes -= gone.bytes.byteLength;
  }
}
