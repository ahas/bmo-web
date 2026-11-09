import { TILE, desk, emptyChair, cooler, lookOf, personFacing, plant, rack, sofa, table, wall } from "./models";
import { turned } from "./iso";

import type { Box } from "./iso";
import type { Actor, Cast } from "./actors";
import type { Plan, Room, RoomKind } from "./space";
import type { SpaceAgent, SpaceNode } from "#shared/space";

// What the voxel space paints (docs/web.md, 「Live status screen」, the space): every wall, every thing and every
// person as a sprite at a tile, in the order they are painted, and the colours of the floor under them. A sprite is
// named by a key that says everything it is drawn from, so one drawn once is drawn from its picture after.

/** One thing to paint: what it is and whose, the key of its sprite and the boxes that sprite is built from, the
 * tile its own corner stands at, and how far it stands, the farthest painted first. */
export interface Drawable {
  kind: "actor" | "thing" | "wall";
  // An actor's name; empty for anything else.
  id: string;
  sprite: string;
  boxes: () => Box[];
  x: number;
  y: number;
  depth: number;
}

// The two tones each kind of room's floor is tiled in, and the colour of its walls.
const FLOORS: Record<RoomKind, [string, string]> = {
  supervisors: ["#c9b38f", "#c0a985"],
  lounge: ["#a3b9a6", "#99b09c"],
  workshop: ["#b9b3a8", "#b0aa9e"],
  node: ["#586273", "#505a6a"],
  repository: ["#d3c4a0", "#cabb96"]
};
const WALLS: Record<RoomKind, string> = { supervisors: "#ece7df", lounge: "#e3ebe4", workshop: "#e2dfd8", node: "#3f4756", repository: "#ebe6d8" };
const PATH: [string, string] = ["#8d95a3", "#868e9c"];

/** The light on a desk's laptop while someone works at it. */
export const WORK_GLOW = "#34d399";

/** The colour of a floor tile: its room's, or the path's between rooms, in one of two tones by its place. */
export function floorColor(plan: Plan, x: number, y: number): string {
  const tile = plan.tiles[y * plan.w + x]!;
  const tones = tile.room === null ? PATH : FLOORS[plan.rooms[tile.room]!.kind];

  return tones[(x + y) % 2]!;
}

// A room's walls: one sprite a tile on each far edge, a window in every third where the room has any.
function walls(room: Room): Drawable[] {
  const color = WALLS[room.kind];
  const lit = room.kind !== "node";
  const drawn: Drawable[] = [];

  for (let at = 0; at < room.d; at += 1) {
    const window = lit && at % 3 === 1;

    drawn.push({ kind: "wall", id: "", sprite: `wall:x:${color}:${window}`, boxes: () => wall("x", color, window), x: room.x, y: room.y + at, depth: room.x + room.y + at + 0.56 });
  }

  for (let at = 0; at < room.w; at += 1) {
    const window = lit && at % 3 === 1;

    drawn.push({ kind: "wall", id: "", sprite: `wall:y:${color}:${window}`, boxes: () => wall("y", color, window), x: room.x + at, y: room.y, depth: room.x + at + room.y + 0.56 });
  }

  return drawn;
}

/** Everything of a plan that is no person: its walls and what stands in its rooms. A desk someone works at shows
 * its light, a seat nobody sits on shows its chair, and a machine's racks blink in the beat given, quicker lamps
 * while work goes on it. */
export function fixtures(plan: Plan, nodes: readonly SpaceNode[], people: Cast, beat: 0 | 1): Drawable[] {
  const drawn: Drawable[] = plan.rooms.flatMap(walls);
  const seated = [...people.values()].filter((actor) => actor.path.length === 0 && actor.spot !== null);
  const at = (x: number, y: number): Actor | null => seated.find((actor) => actor.spot!.x === x && actor.spot!.y === y) ?? null;

  for (const thing of plan.things) {
    const depth = thing.x + thing.y + 1;
    const here = { kind: "thing" as const, id: "", x: thing.x, y: thing.y, depth };

    switch (thing.kind) {
      case "desk": {
        const sitter = at(thing.seat[0], thing.seat[1]);
        const glow = sitter?.mood === "working" ? WORK_GLOW : null;
        const facing = thing.facing;

        drawn.push({ ...here, sprite: `desk:${facing}:${glow ?? "off"}`, boxes: () => turned(desk(glow), facing, TILE) });
        if (sitter === null) drawn.push({ kind: "thing", id: "", sprite: `chair:${facing}`, boxes: () => emptyChair(facing), x: thing.seat[0], y: thing.seat[1], depth: thing.seat[0] + thing.seat[1] + 1 });
        break;
      }
      case "sofa": {
        const facing = thing.facing;

        drawn.push({ ...here, sprite: `sofa:${facing}`, boxes: () => turned(sofa(), facing, TILE) });
        break;
      }
      case "rack": {
        const busy = nodes.find((node) => node.name === thing.node)?.busy === true;
        const state = busy ? "busy" : "quiet";

        drawn.push({ ...here, sprite: `rack:${state}:${beat}`, boxes: () => rack(state, beat) });
        break;
      }
      case "plant":
        drawn.push({ ...here, sprite: "plant", boxes: plant });
        break;
      case "table":
        drawn.push({ ...here, sprite: "table", boxes: table });
        break;
      case "cooler":
        drawn.push({ ...here, sprite: "cooler", boxes: cooler });
        break;
    }
  }

  return drawn;
}

/** The people of the space as they stand now, each drawn by its own look in its pose, facing the way it faces. */
export function people(cast: Cast, agents: readonly SpaceAgent[]): Drawable[] {
  const roles = new Map(agents.map((agent) => [agent.name, agent.role]));

  return [...cast.values()].map((actor): Drawable => {
    const role = roles.get(actor.name) ?? null;
    const seat = actor.chair;

    return {
      kind: "actor",
      id: actor.name,
      sprite: `person:${actor.name}:${role ?? ""}:${actor.pose}:${actor.facing}:${seat}`,
      boxes: () => personFacing(lookOf(actor.name, role), actor.pose, actor.facing, seat),
      x: actor.x,
      y: actor.y,
      depth: actor.x + actor.y + 1.01
    };
  });
}

/** Drawables in the order they are painted: the farthest first, and of two as far as each other the walls, then
 * the things, then the people. */
export function inOrder(drawn: readonly Drawable[]): Drawable[] {
  const rank = { wall: 0, thing: 1, actor: 2 };

  return [...drawn].sort((one, other) => one.depth - other.depth || rank[one.kind] - rank[other.kind]);
}
