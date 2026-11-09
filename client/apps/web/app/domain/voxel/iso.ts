// The voxel space's geometry (docs/web.md, 「Live status screen」, the space): a world of boxes on three axes drawn
// in two-to-one isometry, the order boxes are painted in, and the colours of a box's three faces. Nothing here
// touches a canvas: a box becomes three filled outlines in pixels, which whatever draws them fills.

/** A box of the world, in voxels: its near-origin corner, its size along each axis, and its colour as `#rrggbb`. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  // A face that gives its own light, drawn at its colour whichever way it faces.
  lit?: boolean;
}

/** One filled outline in pixels: its corners in order and its colour. */
export interface Face {
  points: [number, number][];
  color: string;
}

/** How many pixels a voxel takes: half its top's width, half its top's height and its side's height. */
export interface Scale {
  dx: number;
  dy: number;
  dz: number;
}

/** The scale of a whole unit: a voxel's top two units wide and one tall on each half, its side a little taller than
 * its half-width so a cube reads as a cube. */
export function scaleOf(unit: number): Scale {
  return { dx: unit * 2, dy: unit, dz: Math.max(1, Math.round(unit * 2.4)) };
}

/** Where a point of the world stands in pixels: x runs to the right and down, y to the left and down, z up. */
export function project(scale: Scale, x: number, y: number, z: number): [number, number] {
  return [(x - y) * scale.dx, (x + y) * scale.dy - z * scale.dz];
}

/** The world's floor point under a pixel, the inverse of `project` at height zero. */
export function floorAt(scale: Scale, px: number, py: number): [number, number] {
  const across = px / scale.dx;
  const down = py / scale.dy;

  return [(down + across) / 2, (down - across) / 2];
}

function channel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** A colour made lighter (above 1) or darker (below 1). */
export function shade(color: string, by: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const lift = by > 1 ? (one: number) => one + (255 - one) * (by - 1) : (one: number) => one * by;

  return `#${channel(lift(red))}${channel(lift(green))}${channel(lift(blue))}`;
}

// The light falls from above and from the left: the top is the lightest face, the face toward +y the box's own colour
// and the face toward +x the darkest.
const TOP = 1.16;
const LEFT = 0.94;
const RIGHT = 0.76;

/** Whether one box is painted before another: it lies wholly on the far side of the other along some axis. Two boxes
 * that share no such axis stand in each other, and neither is before the other. */
export function behind(one: Box, other: Box): boolean {
  return one.x + one.w <= other.x || one.y + one.d <= other.y || one.z + one.h <= other.z;
}

// A box's place in pixels, as the least rectangle around it.
function span(scale: Scale, box: Box): [number, number, number, number] {
  const left = (box.x - box.y - box.d) * scale.dx;
  const right = (box.x + box.w - box.y) * scale.dx;
  const top = (box.x + box.y) * scale.dy - (box.z + box.h) * scale.dz;
  const bottom = (box.x + box.w + box.y + box.d) * scale.dy - box.z * scale.dz;

  return [left, top, right, bottom];
}

/** The boxes in the order they are painted, the farthest first: a box behind another it overlaps on screen comes
 * before it, and boxes that do not overlap keep a steady order by how far they stand. */
export function painted(scale: Scale, boxes: readonly Box[]): Box[] {
  const spans = boxes.map((box) => span(scale, box));
  const waits = boxes.map(() => 0);
  const after: number[][] = boxes.map(() => []);

  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const [one, other] = [spans[a]!, spans[b]!];

      if (one[2] <= other[0] || other[2] <= one[0] || one[3] <= other[1] || other[3] <= one[1]) continue;

      const first = behind(boxes[a]!, boxes[b]!);
      const second = behind(boxes[b]!, boxes[a]!);

      if (first === second) continue;

      const [from, to] = first ? [a, b] : [b, a];

      after[from]!.push(to);
      waits[to]! += 1;
    }
  }

  const far = (at: number): number => boxes[at]!.x + boxes[at]!.y + boxes[at]!.z;
  const ready = boxes.map((_, at) => at).filter((at) => waits[at] === 0);
  const order: number[] = [];

  while (ready.length > 0) {
    // The farthest of those nothing waits before, so the order is the same whenever the boxes are.
    let pick = 0;

    for (let at = 1; at < ready.length; at += 1) {
      if (far(ready[at]!) < far(ready[pick]!) || (far(ready[at]!) === far(ready[pick]!) && ready[at]! < ready[pick]!)) pick = at;
    }

    const [next] = ready.splice(pick, 1) as [number];

    order.push(next);

    for (const to of after[next]!) {
      waits[to]! -= 1;
      if (waits[to] === 0) ready.push(to);
    }
  }

  // Boxes left in a ring of each other are painted by how far they stand.
  if (order.length < boxes.length) {
    const left = boxes.map((_, at) => at).filter((at) => !order.includes(at));

    order.push(...left.sort((one, other) => far(one) - far(other) || one - other));
  }

  return order.map((at) => boxes[at]!);
}

/** The three faces a box shows — its top, the one toward +y and the one toward +x — in pixels, in the order they are
 * filled. */
export function facesOf(scale: Scale, box: Box): Face[] {
  const at = (x: number, y: number, z: number): [number, number] => project(scale, x, y, z);
  const { x, y, z, w, d, h } = box;
  const tone = (by: number): string => (box.lit === true ? box.color : shade(box.color, by));

  return [
    { points: [at(x, y + d, z + h), at(x + w, y + d, z + h), at(x + w, y + d, z), at(x, y + d, z)], color: tone(LEFT) },
    { points: [at(x + w, y, z + h), at(x + w, y + d, z + h), at(x + w, y + d, z), at(x + w, y, z)], color: tone(RIGHT) },
    { points: [at(x, y, z + h), at(x + w, y, z + h), at(x + w, y + d, z + h), at(x, y + d, z + h)], color: tone(TOP) }
  ];
}

/** Every face of a set of boxes, in the order they are filled. */
export function faces(scale: Scale, boxes: readonly Box[]): Face[] {
  return painted(scale, boxes).flatMap((box) => facesOf(scale, box));
}

/** The least rectangle in pixels around a set of boxes: its left, top, right and bottom. */
export function bounds(scale: Scale, boxes: readonly Box[]): [number, number, number, number] {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];

  for (const box of boxes) {
    const [l, t, r, b] = span(scale, box);

    left = Math.min(left, l);
    top = Math.min(top, t);
    right = Math.max(right, r);
    bottom = Math.max(bottom, b);
  }

  return boxes.length === 0 ? [0, 0, 0, 0] : [left, top, right, bottom];
}

/** A set of boxes moved by an offset. */
export function moved(boxes: readonly Box[], x: number, y: number, z = 0): Box[] {
  return boxes.map((box) => ({ ...box, x: box.x + x, y: box.y + y, z: box.z + z }));
}

/** The four ways a thing faces on the floor: toward +x and +y, which show its front, and toward -x and -y, which
 * show its back. */
export type Facing = "+x" | "+y" | "-x" | "-y";

/** A set of boxes authored facing +x inside a footprint `size` voxels square, turned to face another way: its
 * footprint stays where it stands. */
export function turned(boxes: readonly Box[], facing: Facing, size: number): Box[] {
  switch (facing) {
    case "+x":
      return boxes.map((box) => ({ ...box }));
    case "+y":
      return boxes.map((box) => ({ ...box, x: box.y, y: box.x, w: box.d, d: box.w }));
    case "-x":
      return boxes.map((box) => ({ ...box, x: size - box.x - box.w, y: size - box.y - box.d }));
    case "-y":
      return boxes.map((box) => ({ ...box, x: size - box.y - box.d, y: size - box.x - box.w, w: box.d, d: box.w }));
  }
}
