import type { SpaceView } from "#shared/space";

// The city of the live status screen's space (docs/web.md, 「Live status screen」, the space): one walled-city alley in
// metres, y up, made from a listing of machines, repositories and agents by a seeded random, so the same listing
// stands the same city every time. Nothing here touches a renderer: a building is boxes, a sign is a place and a
// word, a spot is a place and a pose, and the ground is a grid of cells one can walk over.

/** A point of the city, in metres; y is up. */
export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** One box of the city: its lower corner, its size and its colour, by index into the palette the renderer holds. */
export interface Block {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
}

/** What else hangs on and stands among the buildings. A `yaw` turns the thing about y, in radians. */
export type FixtureKind =
  | "ac"
  | "cage"
  | "pipe"
  | "shack"
  | "tank"
  | "awning"
  | "vending"
  | "stall"
  | "stool"
  | "cabinet"
  | "stair"
  | "lamp"
  | "desk"
  | "screen"
  | "rack"
  | "cat"
  | "pole";

export interface Fixture {
  kind: FixtureKind;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  color: number;
  // A thing that glows glows in this colour, by index into the glow palette; none otherwise.
  glow: number | null;
}

/** A window on a facade: lit in a glow colour, or dark. */
export interface Window {
  x: number;
  y: number;
  z: number;
  yaw: number;
  glow: number | null;
}

/** A sign: hanging out from a facade over the alley, or a lightbox flat on it. Its words are what it says. */
export interface Sign {
  at: Vec;
  yaw: number;
  w: number;
  h: number;
  text: string;
  glow: number;
  hanging: boolean;
}

/** A wire or a laundry line between two points. */
export interface Wire {
  from: Vec;
  to: Vec;
  laundry: boolean;
}

/** One machine: a district of the city, its lots and where its rooftop sign and its racks stand. */
export interface District {
  name: string;
  label: string;
  lots: number[];
  sign: Sign;
  rack: Fixture;
}

/** A desk one works at: where one sits and which way one faces. */
export interface Station {
  at: Vec;
  yaw: number;
}

/** A workshop: a lit shopfront with desks. The door is on the alley; one who finds no free desk stands in it. */
export interface Workshop {
  key: string;
  label: string;
  kind: "repository" | "supervisors" | "open";
  door: Vec;
  stand: Vec;
  stations: Station[];
}

/** The kinds of place one rests at, and what one does there. */
export type SpotKind = "noodle" | "rooftop" | "arcade" | "vending" | "stairs" | "awning" | "cat" | "balcony";
export type SpotPose = "sit" | "stand" | "lean";

export interface Spot {
  id: string;
  kind: SpotKind;
  at: Vec;
  yaw: number;
  pose: SpotPose;
  // Where on the ground one leaves the alley for it, and the points climbed from there to it, in order.
  foot: Vec;
  climb: Vec[];
}

/** One lot of ground a building stands on. */
export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  district: number;
}

/** The whole city. The walkable ground is a grid of `cell`-sized cells, `open[row * columns + column]` true where
 * one can walk. */
export interface World {
  seed: number;
  width: number;
  depth: number;
  // Where the street runs: from this z to this z, across the whole width.
  street: [number, number];
  lots: Lot[];
  blocks: Block[];
  fixtures: Fixture[];
  windows: Window[];
  signs: Sign[];
  wires: Wire[];
  districts: District[];
  workshops: Workshop[];
  spots: Spot[];
  cell: number;
  columns: number;
  rows: number;
  open: Uint8Array;
}

// Floors are this tall; alleys this wide at least and at most; lots this wide at least and at most.
export const FLOOR = 2.7;
const ALLEY_LEAST = 4.5;
const ALLEY_MOST = 6.5;
const LOT_LEAST = 6;
const LOT_MOST = 8.5;
const CELL = 0.5;
// The margin of open ground around the city.
const EDGE = 3;

// Colours by index: the building palette the renderer reads, concrete and plaster and rust.
export const BUILDING_COLORS = ["#e9dcc9", "#d9c3b0", "#c9d3d8", "#e3cfa6", "#d6b9b3", "#cdd8c4", "#e0d4e6", "#bfc9d6", "#efe3cf", "#d8cbb8"];
// The glow palette: neon and window light.
export const GLOW_COLORS = ["#ff4fa3", "#41d3e6", "#ffd54a", "#7cff6b", "#ff7a3d", "#b388ff", "#ffe9b0", "#9ad8ff"];

/** The words the signs say: the pack's, handed in; a plain few where none are. */
export interface Words {
  signs: string[];
  arcade: string;
}

const PLAIN_WORDS: Words = { signs: ["24H", "OK", "TEL", "ATM", "BAR"], arcade: "GAME" };

/** A steady number from words, the same wherever it is asked. */
export function hashOf(text: string): number {
  let held = 2166136261;

  for (let at = 0; at < text.length; at += 1) {
    held ^= text.charCodeAt(at);
    held = Math.imul(held, 16777619);
  }

  return held >>> 0;
}

/** A seeded random in [0, 1). */
export function random(seed: number): () => number {
  let state = seed >>> 0 || 1;

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 4294967296;
  };
}

const between = (draw: () => number, least: number, most: number): number => least + draw() * (most - least);
const pick = <T>(draw: () => number, from: readonly T[]): T => from[Math.floor(draw() * from.length)]!;

/** The seed the listing stands on: its machines, its repositories and its agents by name. */
export function seedOf(view: Pick<SpaceView, "nodes" | "repositories" | "agents">): number {
  return hashOf([...view.nodes.map((node) => node.name), "|", ...view.repositories.map((repository) => repository.name), "|", ...view.agents.map((agent) => agent.name)].join(","));
}

interface Plan {
  lots: Lot[];
  street: [number, number];
  // Which way each lot's front faces: toward the street, for the lots along it; any way for the rest.
  fronts: (number | null)[];
  width: number;
  depth: number;
}

// The street this width runs through the city's middle; the shopfronts stand along it, the rest behind them.
const STREET = 9;

// Lots in two rows along the street and rows behind them, each lot its own size and the alleys between them their
// own width, so no two rows line up. The lots along the street are the first `fronting` of the count, in order.
function layLots(draw: () => number, count: number, fronting: number): Plan {
  const columns = Math.max(2, Math.min(6, Math.ceil(fronting / 2)));
  const lots: Lot[] = [];
  const fronts: (number | null)[] = [];
  const rowDepths: number[] = [];
  const rowsNeeded = Math.ceil(count / columns);
  // Rows are numbered from the street outward: 0 and 1 face it, 2 and 3 stand behind 0 and 1, and so on.
  const rowZ: number[] = [];
  let before = 0;
  let after = 0;

  for (let row = 0; row < rowsNeeded; row += 1) {
    const depth = between(draw, LOT_LEAST, LOT_MOST);

    rowDepths.push(depth);

    if (row % 2 === 0) {
      before += depth + (row === 0 ? 0 : between(draw, ALLEY_LEAST, ALLEY_MOST));
      rowZ.push(-before);
    } else {
      rowZ.push(after + (row === 1 ? 0 : between(draw, ALLEY_LEAST, ALLEY_MOST)));
      after = rowZ[row]! + depth;
    }
  }

  const streetZ = EDGE + before;
  let width = 0;
  let placed = 0;

  for (let row = 0; row < rowsNeeded && placed < count; row += 1) {
    const depth = rowDepths[row]!;
    const z = streetZ + (row % 2 === 0 ? rowZ[row]! : rowZ[row]! + STREET);
    let x = EDGE + between(draw, 0, 1.5);

    for (let column = 0; column < columns && placed < count; column += 1) {
      const w = between(draw, LOT_LEAST, LOT_MOST);

      lots.push({ x, z, w, d: depth, district: 0 });
      // A lot on the street faces it: the row before the street faces +z, the row after it faces -z.
      fronts.push(row === 0 ? 0 : row === 1 ? Math.PI : null);
      placed += 1;
      x += w + between(draw, ALLEY_LEAST, ALLEY_MOST);
    }

    width = Math.max(width, x);
  }

  return { lots, fronts, street: [streetZ, streetZ + STREET], width: width + EDGE - ALLEY_LEAST, depth: streetZ + STREET + after + EDGE };
}

interface Facade {
  // The outward normal's yaw, the point of the facade's middle on the ground, and the facade's length.
  yaw: number;
  at: Vec;
  length: number;
}

// The four facades of a lot, each with its outward direction.
function facadesOf(lot: Lot): Facade[] {
  return [
    { yaw: 0, at: { x: lot.x + lot.w / 2, y: 0, z: lot.z + lot.d }, length: lot.w },
    { yaw: Math.PI, at: { x: lot.x + lot.w / 2, y: 0, z: lot.z }, length: lot.w },
    { yaw: Math.PI / 2, at: { x: lot.x + lot.w, y: 0, z: lot.z + lot.d / 2 }, length: lot.d },
    { yaw: -Math.PI / 2, at: { x: lot.x, y: 0, z: lot.z + lot.d / 2 }, length: lot.d }
  ];
}

// A point `out` metres out from a facade and `along` metres along it from its middle.
function onFacade(facade: Facade, along: number, out: number, y: number): Vec {
  const sin = Math.sin(facade.yaw);
  const cos = Math.cos(facade.yaw);

  return { x: facade.at.x + cos * along + sin * out, y, z: facade.at.z - sin * along + cos * out };
}

interface Built {
  blocks: Block[];
  fixtures: Fixture[];
  windows: Window[];
  signs: Sign[];
  floors: number;
  // The facade the ground floor opens on, where the lot is a shopfront.
  front: Facade;
}

// One building on a lot: a ground block, blocks stacked over it that lean out or step back, and everything on its
// walls. A shopfront lot leaves its ground floor open on its front: the interior is the room the renderer lights.
function build(draw: () => number, words: Words, lot: Lot, shopfront: boolean, low: boolean, facing: number | null): Built {
  const floors = shopfront ? Math.floor(between(draw, 2, 4)) : low ? Math.floor(between(draw, 1, 3)) : Math.floor(between(draw, 2, 6));
  const blocks: Block[] = [];
  const fixtures: Fixture[] = [];
  const windows: Window[] = [];
  const signs: Sign[] = [];
  const facades = facadesOf(lot);
  const front = facing === null ? facades[Math.floor(draw() * 2)]! : facades.find((facade) => facade.yaw === facing)!;
  const color = Math.floor(draw() * BUILDING_COLORS.length);

  // A shopfront's open room is two floors tall, so one sees in from above.
  const roomHeight = shopfront ? FLOOR * 2 : FLOOR;

  if (shopfront) {
    // Side walls, a back wall and a slab over them; the front stays open.
    const thick = 0.3;
    const along = front.length / 2;
    const depthIn = front.yaw === 0 || front.yaw === Math.PI ? lot.d : lot.w;

    for (const side of [-1, 1]) {
      const a = onFacade(front, side * (along - thick / 2), -depthIn / 2, 0);

      blocks.push({ x: a.x - (front.yaw === 0 || front.yaw === Math.PI ? thick / 2 : depthIn / 2), y: 0, z: a.z - (front.yaw === 0 || front.yaw === Math.PI ? depthIn / 2 : thick / 2), w: front.yaw === 0 || front.yaw === Math.PI ? thick : depthIn, h: roomHeight, d: front.yaw === 0 || front.yaw === Math.PI ? depthIn : thick, color });
    }

    const back = onFacade(front, 0, -depthIn + thick / 2, 0);

    blocks.push({ x: back.x - (front.yaw === 0 || front.yaw === Math.PI ? front.length / 2 : thick / 2), y: 0, z: back.z - (front.yaw === 0 || front.yaw === Math.PI ? thick / 2 : front.length / 2), w: front.yaw === 0 || front.yaw === Math.PI ? front.length : thick, h: roomHeight, d: front.yaw === 0 || front.yaw === Math.PI ? thick : front.length, color });
  } else {
    blocks.push({ x: lot.x, y: 0, z: lot.z, w: lot.w, h: FLOOR, d: lot.d, color });
  }

  // Upper blocks: each a run of floors, leaning out over the alley or stepping back.
  let floor = shopfront ? 2 : 1;
  let x = lot.x;
  let z = lot.z;
  let w = lot.w;
  let d = lot.d;
  let shade = color;

  while (floor < floors) {
    const run = Math.min(floors - floor, Math.floor(between(draw, 1, 4)));
    const lean = between(draw, -0.35, 0.25);

    // Each run leans out or steps back on its own, never more than a metre past the lot on any side, and never
    // out over the street a shopfront opens on.
    x = Math.max(lot.x - 1, Math.min(lot.x + 1, x - lean * between(draw, 0, 1)));
    z = Math.max(lot.z - 1, Math.min(lot.z + 1, z - lean * between(draw, 0, 1)));
    w = Math.max(3, Math.min(lot.w + 2, w + lean * between(draw, 0.6, 1.4)));
    d = Math.max(3, Math.min(lot.d + 2, d + lean * between(draw, 0.6, 1.4)));
    w = Math.min(w, lot.x + lot.w + 1 - x);
    d = Math.min(d, lot.z + lot.d + 1 - z);

    if (facing === 0) d = Math.min(d, lot.z + lot.d - z);
    if (facing === Math.PI) {
      const back = z + d;

      z = Math.max(z, lot.z);
      d = back - z;
    }
    shade = draw() < 0.4 ? Math.floor(draw() * BUILDING_COLORS.length) : shade;
    blocks.push({ x, y: floor * FLOOR, z, w, h: run * FLOOR, d, color: shade });

    // Windows, a few cages and air conditioners on every facade, a ledge along each floor line.
    for (const facade of facadesOf({ x, z, w, d, district: lot.district })) {
      const count = Math.max(1, Math.floor(facade.length / 2.2));

      for (let level = 0; level < run; level += 1) {
        const y = (floor + level) * FLOOR;
        const ledge = onFacade(facade, 0, 0.08, y - 0.06);

        fixtures.push({ kind: "pipe", x: ledge.x, y: ledge.y, z: ledge.z, w: facade.length + 0.16, h: 0.14, d: 0.18, yaw: facade.yaw, color: 1, glow: null });

        for (let at = 0; at < count; at += 1) {
          const along = (at - (count - 1) / 2) * 2.2 + between(draw, -0.3, 0.3);
          const roll = draw();
          const window = onFacade(facade, along, 0.01, y + 1.0);

          windows.push({ x: window.x, y: window.y, z: window.z, yaw: facade.yaw, glow: roll < 0.45 ? 6 + Math.floor(draw() * 2) : null });

          const sill = onFacade(facade, along, 0.06, y + 0.48);

          fixtures.push({ kind: "pipe", x: sill.x, y: sill.y, z: sill.z, w: 0.95, h: 0.06, d: 0.14, yaw: facade.yaw, color: 8, glow: null });

          if (roll > 0.9) {
            const cage = onFacade(facade, along, 0.3, y + 0.8);
            const slab = onFacade(facade, along, 0.3, y + 0.5);

            fixtures.push({ kind: "cage", x: cage.x, y: cage.y, z: cage.z, w: 1.3, h: 1.3, d: 0.6, yaw: facade.yaw, color: 7, glow: null });
            fixtures.push({ kind: "pipe", x: slab.x, y: slab.y, z: slab.z, w: 1.4, h: 0.1, d: 0.66, yaw: facade.yaw, color: 1, glow: null });
          } else if (roll > 0.78) {
            const ac = onFacade(facade, along + 0.6, 0.3, y + 0.5);

            fixtures.push({ kind: "ac", x: ac.x, y: ac.y, z: ac.z, w: 0.7, h: 0.5, d: 0.5, yaw: facade.yaw, color: 8, glow: null });
          }
        }
      }

      if (draw() < 0.25) {
        const pipe = onFacade(facade, between(draw, -facade.length / 2 + 0.4, facade.length / 2 - 0.4), 0.15, floor * FLOOR);

        fixtures.push({ kind: "pipe", x: pipe.x, y: pipe.y, z: pipe.z, w: 0.14, h: run * FLOOR, d: 0.14, yaw: facade.yaw, color: 4, glow: null });
      }
    }

    floor += run;
  }

  const top = floors * FLOOR;

  // A parapet of a darker tone around the roof, so the roof reads as a roof.
  blocks.push({ x: x - 0.1, y: top, z: z - 0.1, w: w + 0.2, h: 0.35, d: d + 0.2, color: (shade + 3) % BUILDING_COLORS.length });

  // Rooftop: a shack, a water tank, a pole, an antenna, a second tank.
  if (draw() < 0.35) fixtures.push({ kind: "shack", x: x + between(draw, 0.5, Math.max(0.6, w - 3)), y: top, z: z + between(draw, 0.5, Math.max(0.6, d - 3)), w: between(draw, 1.8, 2.6), h: between(draw, 1.6, 2.2), d: between(draw, 1.8, 2.6), yaw: 0, color: 3, glow: null });
  if (draw() < 0.4) fixtures.push({ kind: "tank", x: x + between(draw, 0.4, Math.max(0.5, w - 1.6)), y: top, z: z + between(draw, 0.4, Math.max(0.5, d - 1.6)), w: 1.2, h: 1.6, d: 1.2, yaw: 0, color: 1, glow: null });
  fixtures.push({ kind: "pole", x: x + w - 0.5, y: top, z: z + 0.5, w: 0.1, h: between(draw, 2, 4), d: 0.1, yaw: 0, color: 4, glow: null });
  if (draw() < 0.5) fixtures.push({ kind: "pole", x: x + 0.6, y: top, z: z + d - 0.6, w: 0.08, h: between(draw, 1.5, 3), d: 0.08, yaw: 0, color: 7, glow: null });
  if (draw() < 0.5) fixtures.push({ kind: "tank", x: x + between(draw, 0.4, Math.max(0.5, w - 1.2)), y: top, z: z + between(draw, 0.4, Math.max(0.5, d - 1.2)), w: 0.8, h: 1.1, d: 0.8, yaw: 0, color: 9, glow: null });

  // Hanging signs out over the front alley, from the second floor up.
  const signCount = Math.floor(between(draw, 0, 2));

  for (let at = 0; at < signCount; at += 1) {
    const y = between(draw, FLOOR + 0.6, Math.max(FLOOR + 1, Math.min(top - 2, 4 * FLOOR)));
    const along = between(draw, -front.length / 2 + 1, front.length / 2 - 1);
    const w = between(draw, 0.8, 1.6);
    const h = between(draw, 1.4, 3.2);
    const sign = onFacade(front, along, w / 2 + 0.2, y);

    signs.push({ at: sign, yaw: front.yaw, w, h, text: pick(draw, words.signs), glow: Math.floor(draw() * 6), hanging: true });
  }

  return { blocks, fixtures, windows, signs, floors, front };
}

// Whether a point of the ground lies inside a lot.
function inLot(lot: Lot, x: number, z: number): boolean {
  return x >= lot.x && x <= lot.x + lot.w && z >= lot.z && z <= lot.z + lot.d;
}

/** The city built for a listing. */
export function worldOf(view: Pick<SpaceView, "nodes" | "repositories" | "agents">, words: Words = PLAIN_WORDS): World {
  const seed = seedOf(view);
  const draw = random(seed);
  const nodes = view.nodes.length === 0 ? [{ name: "", label: "", busy: false }] : view.nodes;
  const byNode = new Map<string, typeof view.repositories>();

  for (const repository of view.repositories) {
    const node = repository.node !== null && nodes.some((one) => one.name === repository.node) ? repository.node : nodes[0]!.name;

    byNode.set(node, [...(byNode.get(node) ?? []), repository]);
  }

  // Lots: for each machine, one lot a repository, one for its racks and one or two more for the look; the first
  // district also holds MO Co., the open workshop, the arcade and the noodle stall's neighbours.
  const wanted: { district: number; use: "workshop" | "rack" | "supervisors" | "open" | "arcade" | "filler"; key: string; label: string }[] = [];

  nodes.forEach((node, index) => {
    if (index === 0) {
      wanted.push({ district: 0, use: "supervisors", key: "supervisors", label: "MO Co." });
      wanted.push({ district: 0, use: "open", key: "open", label: "" });
      wanted.push({ district: 0, use: "arcade", key: "arcade", label: "" });
    }

    for (const repository of byNode.get(node.name) ?? []) wanted.push({ district: index, use: "workshop", key: `repository:${repository.name}`, label: repository.label });

    wanted.push({ district: index, use: "rack", key: `rack:${node.name}`, label: node.label });
    wanted.push({ district: index, use: "filler", key: `filler:${node.name}:1`, label: "" });
    wanted.push({ district: index, use: "filler", key: `filler:${node.name}:2`, label: "" });
  });

  // The shopfronts stand along the street, in the order the districts list them; the racks and the fillers behind.
  const fronting = wanted.filter((one) => one.use === "workshop" || one.use === "supervisors" || one.use === "open" || one.use === "arcade");
  const behind = wanted.filter((one) => !fronting.includes(one));

  wanted.splice(0, wanted.length, ...fronting, ...behind);

  const plan = layLots(draw, wanted.length, fronting.length);

  plan.lots.forEach((lot, at) => {
    lot.district = wanted[at]!.district;
  });

  const blocks: Block[] = [];
  const fixtures: Fixture[] = [];
  const windows: Window[] = [];
  const signs: Sign[] = [];
  const wires: Wire[] = [];
  const workshops: Workshop[] = [];
  const spots: Spot[] = [];
  const districts: District[] = nodes.map((node) => ({ name: node.name, label: node.label, lots: [], sign: { at: { x: 0, y: 0, z: 0 }, yaw: 0, w: 0, h: 0, text: node.label, glow: 1, hanging: false }, rack: { kind: "rack", x: 0, y: 0, z: 0, w: 1, h: 2, d: 0.6, yaw: 0, color: 0, glow: 3 } }));
  const tops: Vec[] = [];
  let stairsMade = 0;

  plan.lots.forEach((lot, at) => {
    const use = wanted[at]!;
    const shopfront = use.use === "workshop" || use.use === "supervisors" || use.use === "open" || use.use === "arcade";
    const low = use.use === "rack" || (use.use === "filler" && draw() < 0.5);
    const built = build(draw, words, lot, shopfront, low, plan.fronts[at] ?? null);

    districts[use.district]!.lots.push(at);
    blocks.push(...built.blocks);
    fixtures.push(...built.fixtures);
    windows.push(...built.windows);
    signs.push(...built.signs);
    tops.push({ x: lot.x + lot.w / 2, y: built.floors * FLOOR, z: lot.z + lot.d / 2 });

    const front = built.front;
    const depthIn = front.yaw === 0 || front.yaw === Math.PI ? lot.d : lot.w;

    if (shopfront) {
      const door = onFacade(front, 0, 1.0, 0);
      const stand = onFacade(front, 0, -0.9, 0);
      const stations: Station[] = [];

      if (use.use === "arcade") {
        for (let n = 0; n < 3; n += 1) {
          const cabinet = onFacade(front, (n - 1) * 1.4, -depthIn + 0.9, 0);

          fixtures.push({ kind: "cabinet", x: cabinet.x, y: 0, z: cabinet.z, w: 0.9, h: 1.7, d: 0.8, yaw: front.yaw, color: 7, glow: n % 2 === 0 ? 0 : 1 });
          spots.push({ id: `arcade-${n}`, kind: "arcade", at: onFacade(front, (n - 1) * 1.4, -depthIn + 1.9, 0), yaw: front.yaw + Math.PI, pose: "stand", foot: door, climb: [] });
        }

        signs.push({ at: onFacade(front, 0, 0.15, FLOOR * 2 - 0.9), yaw: front.yaw, w: Math.min(front.length - 1, 3.2), h: 0.8, text: words.arcade, glow: 0, hanging: false });
      } else {
        // Four desks in two rows, the screens toward the back wall.
        const rows = [-depthIn + 1.6, -depthIn + 3.4];

        for (const row of rows) {
          for (const side of [-1.1, 1.1]) {
            const desk = onFacade(front, side, row, 0);
            const seat = onFacade(front, side, row + 0.75, 0);

            fixtures.push({ kind: "desk", x: desk.x, y: 0, z: desk.z, w: 1.4, h: 0.72, d: 0.7, yaw: front.yaw, color: 5, glow: null });
            fixtures.push({ kind: "screen", x: desk.x, y: 0.72, z: desk.z, w: 0.6, h: 0.4, d: 0.05, yaw: front.yaw, color: 7, glow: 7 });
            stations.push({ at: seat, yaw: front.yaw + Math.PI });
          }
        }

        if (use.use !== "open") signs.push({ at: onFacade(front, 0, 0.15, FLOOR * 2 - 0.9), yaw: front.yaw, w: Math.min(front.length - 1, 3.6), h: 0.8, text: use.label, glow: use.use === "supervisors" ? 3 : 1, hanging: false });

        workshops.push({ key: use.key, label: use.label, kind: use.use === "supervisors" ? "supervisors" : use.use === "open" ? "open" : "repository", door, stand, stations });
      }

      // The lit ceiling that makes the room glow, an awning over the door.
      const ceiling = onFacade(front, 0, -depthIn / 2, FLOOR * 2 - 0.18);
      const floorGlow = onFacade(front, 0, -depthIn / 2, 0.01);
      const glow = use.use === "arcade" ? 5 : use.use === "supervisors" ? 3 : 6;

      fixtures.push({ kind: "lamp", x: ceiling.x, y: ceiling.y, z: ceiling.z, w: Math.max(1, front.length - 0.8), h: 0.08, d: Math.max(1, depthIn - 0.8), yaw: front.yaw, color: 7, glow });
      fixtures.push({ kind: "lamp", x: floorGlow.x, y: floorGlow.y, z: floorGlow.z, w: Math.max(1, front.length - 0.7), h: 0.02, d: Math.max(1, depthIn - 0.7), yaw: front.yaw, color: 7, glow });

      const awning = onFacade(front, 0, 0.7, FLOOR * 2 - 0.4);

      fixtures.push({ kind: "awning", x: awning.x, y: awning.y, z: awning.z, w: Math.min(front.length, 4.5), h: 0.12, d: 1.4, yaw: front.yaw, color: use.use === "supervisors" ? 6 : 2, glow: null });
      spots.push({ id: `awning-${at}`, kind: "awning", at: onFacade(front, Math.min(front.length, 4.5) / 2 - 0.7, 0.8, 0), yaw: front.yaw + Math.PI / 2, pose: "stand", foot: onFacade(front, Math.min(front.length, 4.5) / 2 - 0.7, 1.4, 0), climb: [] });
    } else if (use.use === "rack") {
      // The machine's racks in a doorway on the ground floor, and its name on the roof.
      const district = districts[use.district]!;
      const rack = onFacade(front, 0, -0.5, 0);

      district.rack = { kind: "rack", x: rack.x, y: 0, z: rack.z, w: 2.2, h: 2.2, d: 0.7, yaw: front.yaw, color: 0, glow: 3 };
      district.sign = { at: { x: lot.x + lot.w / 2, y: built.floors * FLOOR + 1.6, z: lot.z + lot.d / 2 }, yaw: front.yaw, w: Math.min(lot.w - 0.5, 5), h: 1.2, text: use.label, glow: 1, hanging: false };
      fixtures.push({ kind: "lamp", x: rack.x, y: FLOOR - 0.4, z: rack.z, w: 0.3, h: 0.1, d: 0.3, yaw: 0, color: 7, glow: 6 });
    }

    // Vending machines against a side wall of every other lot.
    if (draw() < 0.55) {
      const side = facadesOf(lot)[2 + Math.floor(draw() * 2)]!;
      const vending = onFacade(side, between(draw, -side.length / 2 + 1, side.length / 2 - 1), 0.45, 0);

      fixtures.push({ kind: "vending", x: vending.x, y: 0, z: vending.z, w: 1.0, h: 1.9, d: 0.8, yaw: side.yaw, color: 7, glow: Math.floor(draw() * 3) });
      spots.push({ id: `vending-${at}`, kind: "vending", at: onFacade(side, 0, 1.3, 0), yaw: side.yaw + Math.PI, pose: "stand", foot: onFacade(side, 0, 1.3, 0), climb: [] });
    }

    // An outside stair up one building in three: its landing is a spot, and so is the roof it leads to on a low
    // building, and a caged balcony on the first floor beside it.
    if (stairsMade < 3 && (low || draw() < 0.35)) {
      const side = facadesOf(lot)[2 + Math.floor(draw() * 2)]!;
      const foot = onFacade(side, -side.length / 2 + 1.2, 1.1, 0);
      const landing = onFacade(side, side.length / 2 - 1.2, 0.7, FLOOR);

      stairsMade += 1;
      fixtures.push({ kind: "stair", x: (foot.x + landing.x) / 2, y: 0, z: (foot.z + landing.z) / 2, w: Math.hypot(landing.x - foot.x, landing.z - foot.z), h: FLOOR, d: 1.0, yaw: side.yaw, color: 4, glow: null });
      spots.push({ id: `stairs-${at}`, kind: "stairs", at: { x: (foot.x + landing.x) / 2, y: FLOOR / 2, z: (foot.z + landing.z) / 2 }, yaw: side.yaw, pose: "sit", foot, climb: [{ x: (foot.x + landing.x) / 2, y: FLOOR / 2, z: (foot.z + landing.z) / 2 }] });
      spots.push({ id: `balcony-${at}`, kind: "balcony", at: onFacade(side, side.length / 2 - 2.6, 0.5, FLOOR), yaw: side.yaw, pose: "lean", foot, climb: [landing, onFacade(side, side.length / 2 - 2.6, 0.5, FLOOR)] });
      fixtures.push({ kind: "cage", x: onFacade(side, side.length / 2 - 2.6, 0.5, FLOOR).x, y: FLOOR, z: onFacade(side, side.length / 2 - 2.6, 0.5, FLOOR).z, w: 1.6, h: 1.2, d: 1.0, yaw: side.yaw, color: 7, glow: null });

      if (low) {
        const roofEdge = { x: lot.x + lot.w / 2, y: built.floors * FLOOR, z: lot.z + lot.d / 2 };

        spots.push({ id: `rooftop-${at}`, kind: "rooftop", at: roofEdge, yaw: side.yaw + Math.PI, pose: "sit", foot, climb: [landing, { x: landing.x, y: built.floors * FLOOR, z: landing.z }, roofEdge] });
      }
    }
  });

  // The noodle stall in the widest alley gap of the first district, with three stools; the cat corner at the far end.
  const first = plan.lots[0]!;
  const stallAt = { x: first.x + first.w + 1.4, y: 0, z: first.z + first.d + STREET - 1.6 };

  fixtures.push({ kind: "stall", x: stallAt.x, y: 0, z: stallAt.z, w: 2.2, h: 1.0, d: 1.0, yaw: 0, color: 3, glow: 2 });
  fixtures.push({ kind: "awning", x: stallAt.x, y: 2.1, z: stallAt.z + 0.4, w: 2.8, h: 0.1, d: 2.2, yaw: 0, color: 2, glow: null });
  fixtures.push({ kind: "lamp", x: stallAt.x, y: 1.9, z: stallAt.z + 0.6, w: 0.25, h: 0.25, d: 0.25, yaw: 0, color: 7, glow: 2 });

  for (let n = 0; n < 3; n += 1) {
    const stool = { x: stallAt.x + (n - 1) * 0.75, y: 0, z: stallAt.z + 1.2 };

    fixtures.push({ kind: "stool", x: stool.x, y: 0, z: stool.z, w: 0.36, h: 0.42, d: 0.36, yaw: 0, color: 3, glow: null });
    spots.push({ id: `noodle-${n}`, kind: "noodle", at: stool, yaw: Math.PI, pose: "sit", foot: { x: stool.x, y: 0, z: stool.z + 0.8 }, climb: [stool] });
  }

  const last = plan.lots[Math.min(plan.lots.length - 1, Math.max(0, fronting.length - 1))]!;
  const catAt = { x: last.x + last.w + 1.2, y: 0, z: first.z + first.d + 1.2 };

  fixtures.push({ kind: "cat", x: catAt.x + 0.6, y: 0, z: catAt.z, w: 0.3, h: 0.25, d: 0.5, yaw: 0.6, color: 8, glow: null });
  spots.push({ id: "cat", kind: "cat", at: catAt, yaw: 0.3, pose: "stand", foot: catAt, climb: [] });

  // Wires and laundry between neighbouring rooftops.
  for (let at = 1; at < tops.length; at += 1) {
    const from = tops[at - 1]!;
    const to = tops[at]!;

    if (Math.hypot(from.x - to.x, from.z - to.z) < 22) {
      wires.push({ from: { x: from.x, y: from.y + 1.2, z: from.z }, to: { x: to.x, y: to.y + 1.0, z: to.z }, laundry: false });
      if (draw() < 0.3) wires.push({ from: { x: from.x + 1, y: Math.min(from.y, to.y) * 0.5 + FLOOR, z: from.z + 0.5 }, to: { x: to.x - 1, y: Math.min(from.y, to.y) * 0.5 + FLOOR + 0.3, z: to.z - 0.5 }, laundry: true });
    }
  }

  // The walkable ground: every cell outside a lot, plus the shopfronts' insides.
  const columns = Math.ceil(plan.width / CELL);
  const rows = Math.ceil(plan.depth / CELL);
  const open = new Uint8Array(columns * rows);
  const insides = new Set<number>();

  plan.lots.forEach((lot, at) => {
    const use = wanted[at]!.use;

    if (use === "workshop" || use === "supervisors" || use === "open" || use === "arcade") insides.add(at);
  });

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5) * CELL;
      const z = (row + 0.5) * CELL;
      let walkable = true;

      for (let at = 0; at < plan.lots.length; at += 1) {
        const lot = plan.lots[at]!;

        if (!inLot(lot, x, z)) continue;

        // Inside a shopfront, the band behind its walls is the room; everything else of a lot is a building.
        walkable = insides.has(at) && x > lot.x + 0.45 && x < lot.x + lot.w - 0.45 && z > lot.z + 0.45 && z < lot.z + lot.d - 0.45;
        break;
      }

      open[row * columns + column] = walkable ? 1 : 0;
    }
  }

  // The desks, the stall and the cabinets take their cells back.
  for (const fixture of fixtures) {
    if (fixture.kind !== "desk" && fixture.kind !== "stall" && fixture.kind !== "cabinet" && fixture.kind !== "vending" && fixture.kind !== "rack") continue;

    const half = Math.max(fixture.w, fixture.d) / 2;

    for (let z = fixture.z - half; z <= fixture.z + half; z += CELL) {
      for (let x = fixture.x - half; x <= fixture.x + half; x += CELL) {
        const column = Math.floor(x / CELL);
        const row = Math.floor(z / CELL);

        if (column >= 0 && column < columns && row >= 0 && row < rows) open[row * columns + column] = 0;
      }
    }
  }

  // Bulbs strung over the street.
  for (let x = EDGE + 2; x < plan.width - EDGE; x += between(draw, 3, 5)) {
    fixtures.push({ kind: "lamp", x, y: 3.6 + between(draw, -0.3, 0.3), z: plan.street[0] + between(draw, 1.5, STREET - 1.5), w: 0.22, h: 0.22, d: 0.22, yaw: 0, color: 7, glow: 6 });
  }

  return { seed, width: plan.width, depth: plan.depth, street: plan.street, lots: plan.lots, blocks, fixtures, windows, signs, wires, districts, workshops, spots, cell: CELL, columns, rows, open };
}

/** The cell a point of the ground falls in. */
export function cellOf(world: World, x: number, z: number): [number, number] {
  return [Math.max(0, Math.min(world.columns - 1, Math.floor(x / world.cell))), Math.max(0, Math.min(world.rows - 1, Math.floor(z / world.cell)))];
}

/** Whether one can walk on a cell. */
export function walkable(world: World, column: number, row: number): boolean {
  return column >= 0 && row >= 0 && column < world.columns && row < world.rows && world.open[row * world.columns + column] === 1;
}

/** The nearest walkable cell to a point, searched outward. */
export function nearestOpen(world: World, x: number, z: number): [number, number] {
  const [column, row] = cellOf(world, x, z);

  for (let ring = 0; ring < 12; ring += 1) {
    for (let dz = -ring; dz <= ring; dz += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        if (walkable(world, column + dx, row + dz)) return [column + dx, row + dz];
      }
    }
  }

  return [column, row];
}

/** The way across the ground from one point to another, as the points of the cells walked through, the first the
 * cell after the start; empty where the two are in the same cell, and the straight line where no way is found. */
export function groundPath(world: World, from: Vec, to: Vec): Vec[] {
  const start = nearestOpen(world, from.x, from.z);
  const goal = nearestOpen(world, to.x, to.z);
  const key = (column: number, row: number): number => row * world.columns + column;
  const startKey = key(start[0], start[1]);
  const goalKey = key(goal[0], goal[1]);

  if (startKey === goalKey) return [];

  const came = new Map<number, number>();
  const cost = new Map<number, number>([[startKey, 0]]);
  const heap: [number, number][] = [[0, startKey]];
  const heuristic = (at: number): number => {
    const column = at % world.columns;
    const row = Math.floor(at / world.columns);

    return Math.hypot(column - goal[0], row - goal[1]);
  };
  const closed = new Set<number>();
  let found = false;

  while (heap.length > 0) {
    let best = 0;

    for (let at = 1; at < heap.length; at += 1) if (heap[at]![0] < heap[best]![0]) best = at;

    const [, current] = heap.splice(best, 1)[0]!;

    if (current === goalKey) {
      found = true;
      break;
    }

    if (closed.has(current)) continue;
    closed.add(current);

    const column = current % world.columns;
    const row = Math.floor(current / world.columns);
    const here = cost.get(current)!;

    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        if (!walkable(world, column + dx, row + dz)) continue;
        // No cutting a corner past a wall.
        if (dx !== 0 && dz !== 0 && (!walkable(world, column + dx, row) || !walkable(world, column, row + dz))) continue;

        const next = key(column + dx, row + dz);
        const stepCost = here + (dx !== 0 && dz !== 0 ? 1.4142 : 1);

        if (stepCost < (cost.get(next) ?? Infinity)) {
          cost.set(next, stepCost);
          came.set(next, current);
          heap.push([stepCost + heuristic(next), next]);
        }
      }
    }
  }

  if (!found) return [to];

  const path: Vec[] = [];
  let at = goalKey;

  while (at !== startKey) {
    path.push({ x: ((at % world.columns) + 0.5) * world.cell, y: 0, z: (Math.floor(at / world.columns) + 0.5) * world.cell });
    at = came.get(at)!;
  }

  path.reverse();

  // The last point is the exact place asked for rather than its cell's middle.
  path[path.length - 1] = { x: to.x, y: 0, z: to.z };

  return path;
}
