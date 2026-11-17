import sharp from "sharp";

import { unitBytes } from "./units";

import type { ExactMessageId, MediaShape } from "#shared/types";

// A kept picture's width and height, read as a room's page is read so the picture keeps its room before it has loaded
// (docs/web.md, the room screen's bubble with pictures). Only the head of the file is asked for: every format a picture
// is kept in states its size within it, a JPEG's frame header standing after whatever metadata precedes it. A size
// once read never changes, since a message's picture is never written again, so it is kept for as long as the server
// runs; a picture whose size could not be read is asked for again the next time.

// How much of a picture's file is read for its size.
const HEAD_BYTES = 65_536;
// How many sizes are kept; the oldest goes first.
const KEPT = 20_000;
// The orientations that turn a picture a quarter turn, so it stands with its width and height swapped.
const TURNED = new Set([5, 6, 7, 8]);

const sizes = new Map<string, MediaShape>();

/** The width and height a message's kept picture stands at, or null where the receiver keeps none or its head says none. */
export async function pictureShape(chatId: number, messageId: ExactMessageId): Promise<MediaShape | null> {
  const key = `${chatId}/${messageId}`;
  const kept = sizes.get(key);

  if (kept !== undefined) return kept;

  const shape = await readShape(chatId, messageId).catch(() => null);

  if (shape !== null) {
    if (sizes.size >= KEPT) sizes.delete(sizes.keys().next().value!);
    sizes.set(key, shape);
  }

  return shape;
}

async function readShape(chatId: number, messageId: ExactMessageId): Promise<MediaShape | null> {
  const answer = await unitBytes("RECEIVER", `/rooms/${chatId}/messages/${messageId}/picture`, { headers: { range: `bytes=0-${HEAD_BYTES - 1}` } });

  if (!answer.ok) {
    await answer.body?.cancel();
    return null;
  }

  const { width, height, orientation } = await sharp(new Uint8Array(await answer.arrayBuffer())).metadata();

  if (width === undefined || height === undefined || width <= 0 || height <= 0) return null;

  return orientation !== undefined && TURNED.has(orientation) ? { width: height, height: width } : { width, height };
}
