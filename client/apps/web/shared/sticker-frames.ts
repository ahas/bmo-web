// How a sticker's picture is asked to play (docs/web.md, the room screen's wordless messages): over and over for as long as it stands,
// whatever its file says, or still on its first frame where the reader asked for less movement. The browser names
// which on the picture's address and the console's server writes the picture so.

/** The frames a sticker's picture goes out with. */
export type StickerFrames = "loop" | "still";

/** The address's query field the frames are named in. */
export const FRAMES_FIELD = "frames";

/** The frames an address asks a sticker's picture to go out with, or null where it asks for the picture as it is. */
export function framesAsked(value: unknown): StickerFrames | null {
  return value === "loop" || value === "still" ? value : null;
}

/** A sticker picture's address, asking for it looping or still. */
export function framedAddress(address: string, frames: StickerFrames): string {
  return `${address}${address.includes("?") ? "&" : "?"}${FRAMES_FIELD}=${frames}`;
}
