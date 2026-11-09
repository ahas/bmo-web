import type { Facing } from "./iso";
import type { SpaceView } from "#shared/space";

// The voxel space's plan (docs/web.md, 「Live status screen」, the space): the rooms the space is made of and where
// each stands on the floor, what stands in each and where a person may sit, stand and walk. A plan is made from the
// machines and the repositories alone, so it stands still while the agents come and go.

/** What a room is: the supervisors' room, the lounge where an agent with no work waits, the workshop for work in no
 * repository, a machine's room, or a repository's. */
export type RoomKind = "supervisors" | "lounge" | "workshop" | "node" | "repository";

/** Where a person may be: a seat at a desk, a seat on a sofa, or a place to stand. */
export interface Spot {
  room: string;
  kind: "station" | "sofa" | "stand";
  x: number;
  y: number;
  facing: Facing;
}

/** What stands on a tile besides a person. */
export type Thing =
  | { kind: "desk"; x: number; y: number; facing: Facing; seat: [number, number] }
  | { kind: "sofa"; x: number; y: number; facing: Facing }
  | { kind: "rack"; x: number; y: number; node: string }
  | { kind: "plant" | "table" | "cooler"; x: number; y: number };

/** One room: its key, its kind, the name on its plate, the machine or repository it stands for, and the tiles it
 * takes — its near-origin corner and its size. */
export interface Room {
  key: string;
  kind: RoomKind;
  label: string;
  // The repository or the machine it is, by name; none for a room that stands for neither.
  name: string | null;
  // The machine a repository's room stands on, by its label; none where it names none.
  node: string | null;
  x: number;
  y: number;
  w: number;
  d: number;
}

/** The whole plan: its size in tiles, its rooms, what stands in them, where a person may be, and which tiles are
 * walked on. */
export interface Plan {
  w: number;
  d: number;
  rooms: Room[];
  things: Thing[];
  spots: Spot[];
  // Every tile, row by row: whether it is floor and which room's, whether a thing blocks it, and whether a wall
  // stands on its far edge along x or along y.
  tiles: Tile[];
}

export interface Tile {
  room: number | null;
  blocked: boolean;
  wallX: boolean;
  wallY: boolean;
}

// The narrowest and the widest a row of rooms is tried at, in tiles: the floor is laid out at the width that leaves
// it most nearly square, which is what fits a box best seen from its corner.
const ROW_LEAST = 14;
const ROW_MOST = 64;
// How many seats a column of the lounge's sofa holds, and how many desks a repository's room holds.
const SOFA_SEATS = 4;
const REPOSITORY_DESKS = 4;
const WORKSHOP_DESKS = 6;

interface Draft {
  key: string;
  kind: RoomKind;
  label: string;
  name: string | null;
  node: string | null;
  w: number;
  d: number;
  things: Thing[];
  spots: Omit<Spot, "room">[];
}

// A room of desks: `count` stations in two rows, each a seat facing +x with its desk before it, a column of floor
// between two stations and a row of floor between the two rows.
function deskRoom(count: number): Pick<Draft, "w" | "d" | "things" | "spots"> {
  const columns = Math.max(1, Math.ceil(count / 2));
  const things: Thing[] = [];
  const spots: Omit<Spot, "room">[] = [];

  for (let at = 0; at < count; at += 1) {
    const x = 1 + Math.floor(at / 2) * 3;
    const y = 1 + (at % 2) * 2;

    things.push({ kind: "desk", x: x + 1, y, facing: "+x", seat: [x, y] });
    spots.push({ kind: "station", x, y, facing: "+x" });
  }

  const w = columns * 3 + 1;
  const d = 5;

  // Where one stands who finds no free desk: the room's near row.
  for (let x = 1; x < w; x += 1) spots.push({ kind: "stand", x, y: d - 1, facing: "+y" });
  things.push({ kind: "plant", x: w - 1, y: 0 });

  return { w, d, things, spots };
}

// The lounge: columns of sofa seats facing +x, a place to stand before each seat, and something to drink.
function loungeRoom(count: number): Pick<Draft, "w" | "d" | "things" | "spots"> {
  const columns = Math.max(1, Math.ceil(count / (SOFA_SEATS * 2)));
  const things: Thing[] = [];
  const sofas: Omit<Spot, "room">[] = [];
  const stands: Omit<Spot, "room">[] = [];

  for (let column = 0; column < columns; column += 1) {
    const x = 1 + column * 3;

    for (let seat = 0; seat < SOFA_SEATS; seat += 1) {
      things.push({ kind: "sofa", x, y: 1 + seat, facing: "+x" });
      sofas.push({ kind: "sofa", x, y: 1 + seat, facing: "+x" });
      stands.push({ kind: "stand", x: x + 2, y: 1 + seat, facing: seat % 2 === 0 ? "+y" : "+x" });
    }
  }

  const w = columns * 3 + 2;
  const d = SOFA_SEATS + 3;

  things.push({ kind: "cooler", x: w - 1, y: 0 }, { kind: "plant", x: 0, y: d - 1 }, { kind: "table", x: w - 2, y: d - 2 });

  return { w, d, things, spots: [...sofas, ...stands] };
}

// A machine's room: its racks along the far wall.
function nodeRoom(node: string): Pick<Draft, "w" | "d" | "things" | "spots"> {
  return {
    w: 4,
    d: 3,
    things: [1, 2, 3].map((x): Thing => ({ kind: "rack", x, y: 0, node })),
    spots: [{ kind: "stand", x: 1, y: 2, facing: "-y" }, { kind: "stand", x: 2, y: 2, facing: "-y" }]
  };
}

/** The key of the room a repository stands in. */
export function repositoryRoom(name: string): string {
  return `repository:${name}`;
}

// Rooms laid out in rows no wider than `most`: a room after another along x with a tile of path between, a row
// after another along y, a room that would pass the width starting the next row.
function laid(rooms: readonly Draft[], most: number): { placed: (Draft & { x: number; y: number })[]; w: number; d: number } {
  const placed: (Draft & { x: number; y: number })[] = [];
  let x = 1;
  let y = 1;
  let depth = 0;

  for (const room of rooms) {
    if (x > 1 && x + room.w > most) {
      y += depth + 1;
      x = 1;
      depth = 0;
    }

    placed.push({ ...room, x, y });
    x += room.w + 1;
    depth = Math.max(depth, room.d);
  }

  return { placed, w: Math.max(...placed.map((room) => room.x + room.w)) + 1, d: y + depth + 1 };
}

/** The plan of a space: the supervisors' room, the lounge and the workshop first, then every machine's own room
 * with the rooms of the repositories on it after it, the repositories that name no machine standing with the first
 * one. The rooms stand in rows in that order, broken where that leaves the floor most nearly square. */
export function planOf(view: Pick<SpaceView, "nodes" | "repositories" | "agents">): Plan {
  const supervisors = view.agents.filter((agent) => agent.role === null).length;
  const seated = view.agents.filter((agent) => agent.role !== null).length;
  const drafts: Draft[] = [
    { key: "supervisors", kind: "supervisors", label: "", name: null, node: null, ...deskRoom(Math.max(1, supervisors)) },
    { key: "lounge", kind: "lounge", label: "", name: null, node: null, ...loungeRoom(Math.max(1, seated)) },
    { key: "workshop", kind: "workshop", label: "", name: null, node: null, ...deskRoom(WORKSHOP_DESKS) }
  ];
  const homes = view.nodes.length === 0 ? [{ name: "", label: "" }] : view.nodes;

  for (const [at, node] of homes.entries()) {
    if (node.name !== "") drafts.push({ key: `node:${node.name}`, kind: "node", label: node.label, name: node.name, node: null, ...nodeRoom(node.name) });

    for (const repository of view.repositories) {
      const here = repository.node === node.name || (at === 0 && (repository.node === null || !homes.some((one) => one.name === repository.node)));

      if (!here) continue;

      drafts.push({ key: repositoryRoom(repository.name), kind: "repository", label: repository.label, name: repository.name, node: node.label === "" ? null : node.label, ...deskRoom(REPOSITORY_DESKS) });
    }
  }

  // The width that leaves the floor's two sides together the shortest, and of two as short the more nearly square.
  let best = laid(drafts, ROW_LEAST);

  for (let most = ROW_LEAST + 1; most <= ROW_MOST; most += 1) {
    const next = laid(drafts, most);

    if (next.w + next.d < best.w + best.d || (next.w + next.d === best.w + best.d && Math.abs(next.w - next.d) < Math.abs(best.w - best.d))) best = next;
  }

  const { placed, w, d } = best;
  const tiles: Tile[] = Array.from({ length: w * d }, () => ({ room: null, blocked: false, wallX: false, wallY: false }));
  const rooms: Room[] = [];
  const things: Thing[] = [];
  const spots: Spot[] = [];

  for (const [index, room] of placed.entries()) {
    rooms.push({ key: room.key, kind: room.kind, label: room.label, name: room.name, node: room.node, x: room.x, y: room.y, w: room.w, d: room.d });

    for (let dy = 0; dy < room.d; dy += 1) {
      for (let dx = 0; dx < room.w; dx += 1) {
        const tile = tiles[(room.y + dy) * w + room.x + dx]!;

        tile.room = index;
        tile.wallX = dx === 0;
        tile.wallY = dy === 0;
      }
    }

    for (const thing of room.things) {
      const moved = { ...thing, x: thing.x + room.x, y: thing.y + room.y } as Thing;

      if (moved.kind === "desk") moved.seat = [moved.seat[0] + room.x, moved.seat[1] + room.y];
      things.push(moved);
      tiles[moved.y * w + moved.x]!.blocked = true;
    }

    for (const spot of room.spots) spots.push({ ...spot, room: room.key, x: spot.x + room.x, y: spot.y + room.y });
  }

  return { w, d, rooms, things, spots, tiles };
}

/** The tile of a plan at a place, or none past its edge. */
export function tileAt(plan: Plan, x: number, y: number): Tile | null {
  return x < 0 || y < 0 || x >= plan.w || y >= plan.d ? null : plan.tiles[y * plan.w + x]!;
}

// Whether one may step from a tile to the next one over: both are in the plan, the next holds nothing that blocks
// it unless it is where the walk ends, and no wall stands on the edge between them. A wall stands on a room's far
// edges, so a room is walked into from its near sides.
function open(plan: Plan, fromX: number, fromY: number, toX: number, toY: number, end: readonly [number, number]): boolean {
  const from = tileAt(plan, fromX, fromY);
  const to = tileAt(plan, toX, toY);

  if (from === null || to === null) return false;
  if (to.blocked && !(toX === end[0] && toY === end[1])) return false;
  if (toX > fromX) return !to.wallX;
  if (toX < fromX) return !from.wallX;
  if (toY > fromY) return !to.wallY;

  return !from.wallY;
}

/** The tiles one walks over from one tile to another, the first step first and the last tile the end; empty where
 * one already stands there, and the end alone where no way leads to it. */
export function pathOf(plan: Plan, from: readonly [number, number], to: readonly [number, number]): [number, number][] {
  if (from[0] === to[0] && from[1] === to[1]) return [];

  const came = new Map<number, number>();
  const start = from[1] * plan.w + from[0];
  const goal = to[1] * plan.w + to[0];
  let edge = [start];

  came.set(start, start);

  // Every step costs the same, so the first way found to a tile is a shortest one.
  while (edge.length > 0 && !came.has(goal)) {
    const next: number[] = [];

    for (const at of edge) {
      const x = at % plan.w;
      const y = Math.floor(at / plan.w);

      for (const [toX, toY] of [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]] as const) {
        const key = toY * plan.w + toX;

        if (came.has(key) || !open(plan, x, y, toX, toY, to)) continue;

        came.set(key, at);
        next.push(key);
      }
    }

    edge = next;
  }

  if (!came.has(goal)) return [[to[0], to[1]]];

  const path: [number, number][] = [];

  for (let at = goal; at !== start; at = came.get(at)!) path.unshift([at % plan.w, Math.floor(at / plan.w)]);

  return path;
}

/** The room of a plan by its key. */
export function roomOf(plan: Plan, key: string): Room | null {
  return plan.rooms.find((room) => room.key === key) ?? null;
}

/** The room a tile is in, or none for a path between rooms. */
export function roomAt(plan: Plan, x: number, y: number): Room | null {
  const index = tileAt(plan, Math.floor(x), Math.floor(y))?.room ?? null;

  return index === null ? null : plan.rooms[index]!;
}
