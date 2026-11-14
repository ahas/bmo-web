import type { ExactMessageId } from "#shared/types";

// The shape of each picture the console has seen, so a picture in a bubble keeps its room before it
// has loaded (docs/web.md, the room screen's section on a bubble with pictures). A picture the owner sends is measured from its own
// preview before its bubble is first drawn, and the shape follows it to the archived message that takes
// its place, so neither the rise nor the hand-over moves anything when the picture lands. Every
// picture that loads is remembered as well, so a row drawn again keeps the room it had. The preview
// itself follows too, standing in for the archived picture until that has loaded, so the picture
// never goes blank as the archived message takes the row's place.

export interface PictureShape {
  width: number;
  height: number;
}

const shapes = reactive(new Map<string, PictureShape>());
const standIns = reactive(new Map<string, string>());

// A picture's place in the record: the address it loads from, or the message it belongs to.
export function messagePicture(messageId: ExactMessageId): string {
  return `m${messageId}`;
}

export function rememberShape(key: string, shape: PictureShape): void {
  if (shape.width > 0 && shape.height > 0) {
    shapes.set(key, shape);
  }
}

export function shapeOf(...keys: (string | null | undefined)[]): PictureShape | null {
  for (const key of keys) {
    const shape = key === null || key === undefined ? undefined : shapes.get(key);

    if (shape !== undefined) {
      return shape;
    }
  }

  return null;
}

// The preview a picture is drawn as until its own copy has loaded. It is the browser's, so it is
// handed here to be let go of once that copy stands, or once whoever handed it is gone.
export function standIn(key: string, previewUrl: string): void {
  const before = standIns.get(key);

  if (before !== undefined && before !== previewUrl) {
    URL.revokeObjectURL(before);
  }

  standIns.set(key, previewUrl);
}

export function standInOf(key: string): string | null {
  return standIns.get(key) ?? null;
}

export function releaseStandIn(key: string): void {
  const previewUrl = standIns.get(key);

  if (previewUrl !== undefined) {
    standIns.delete(key);
    URL.revokeObjectURL(previewUrl);
  }
}

// The shape of a picture the browser can load, read by loading it; none where it cannot be.
export async function measurePicture(src: string): Promise<PictureShape | null> {
  const picture = new Image();

  picture.src = src;

  try {
    await picture.decode();
  } catch {
    return null;
  }

  return { width: picture.naturalWidth, height: picture.naturalHeight };
}
