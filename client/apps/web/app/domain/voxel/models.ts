import { moved, turned } from "./iso";

import type { Box, Facing } from "./iso";

// The voxel space's models (docs/web.md, 「Live status screen」, the space): everything that stands on a floor tile,
// as boxes inside the tile's own cube. A tile is eight voxels on a side, and every model is written facing +x and
// turned to the way it stands.

/** How many voxels a floor tile is on a side. */
export const TILE = 8;

/** What a person of the space looks like: the colours of its skin, hair, top and legs, and what it wears on its head. */
export interface Look {
  skin: string;
  hair: string;
  top: string;
  legs: string;
  // A supervisor wears a headset, which tells it from an agent of a role at a glance.
  headset: boolean;
}

/** What a person is doing, which is how it is drawn: standing, either step of a walk, sitting still, either stroke
 * of typing, or dozing. */
export type Pose = "stand" | "step-a" | "step-b" | "sit" | "type-a" | "type-b" | "doze";

const SKINS = ["#f1c9a5", "#e0ac84", "#c68a5e", "#8d5a3b", "#f6d7b8"];
const HAIRS = ["#2b2118", "#4a3222", "#7a4a26", "#c9a063", "#1c1c22", "#8a8f98", "#a23b2c"];
const LEGS = ["#39424f", "#2f3a52", "#4a4038", "#3b3b44"];
// A role's top, by the role's name, so every agent of a role is told by its colour.
const TOPS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6", "#6366f1", "#eab308"];
const SUPERVISOR_TOP = "#f4f4f5";

/** A steady number from a name, the same wherever it is asked. */
export function hashOf(name: string): number {
  let held = 2166136261;

  for (let at = 0; at < name.length; at += 1) {
    held ^= name.charCodeAt(at);
    held = Math.imul(held, 16777619);
  }

  return held >>> 0;
}

/** The colour every agent of a role wears. */
export function roleColor(role: string): string {
  return TOPS[hashOf(role) % TOPS.length]!;
}

/** A person's look: its top by its role, the rest by its own name, so one agent looks the same every time. */
export function lookOf(name: string, role: string | null): Look {
  const seed = hashOf(name);

  return {
    skin: SKINS[seed % SKINS.length]!,
    hair: HAIRS[(seed >>> 4) % HAIRS.length]!,
    legs: LEGS[(seed >>> 8) % LEGS.length]!,
    top: role === null ? SUPERVISOR_TOP : roleColor(role),
    headset: role === null
  };
}

const CHAIR = "#4b5563";
const CHAIR_DARK = "#374151";
const EYE = "#1f2937";

// The chair a seated person sits on, its back toward -x.
function chair(): Box[] {
  return [
    { x: 3, y: 3, z: 0, w: 2, d: 2, h: 2, color: CHAIR_DARK },
    { x: 2, y: 2, z: 2, w: 4, d: 4, h: 1, color: CHAIR },
    { x: 1, y: 2, z: 3, w: 1, d: 4, h: 5, color: CHAIR }
  ];
}

/** A chair nobody sits on, facing a way. */
export function emptyChair(facing: Facing): Box[] {
  return turned(chair(), facing, TILE);
}

function head(look: Look, x: number, z: number): Box[] {
  const boxes: Box[] = [
    { x, y: 2, z, w: 4, d: 4, h: 4, color: look.skin },
    // Its hair: over the top and down the back.
    { x, y: 2, z: z + 4, w: 4, d: 4, h: 1, color: look.hair },
    { x: x - 0.5, y: 2, z: z + 1, w: 0.5, d: 4, h: 3, color: look.hair },
    // Its eyes, on the face it looks out of.
    { x: x + 4, y: 2.75, z: z + 1.75, w: 0.25, d: 0.9, h: 0.9, color: EYE },
    { x: x + 4, y: 4.35, z: z + 1.75, w: 0.25, d: 0.9, h: 0.9, color: EYE }
  ];

  if (look.headset) {
    boxes.push(
      { x: x + 1.5, y: 1.5, z: z + 1, w: 1.5, d: 0.5, h: 2, color: EYE },
      { x: x + 1.5, y: 6, z: z + 1, w: 1.5, d: 0.5, h: 2, color: EYE },
      { x: x + 1.5, y: 1.5, z: z + 5, w: 1, d: 5, h: 0.5, color: EYE },
      { x: x + 3, y: 6, z: z + 0.5, w: 1.5, d: 0.5, h: 0.5, color: EYE }
    );
  }

  return boxes;
}

/** A person facing +x in a pose, standing at its tile's middle; a seated one sits on a chair where `seat` says so,
 * and on whatever its tile holds where it does not. */
export function person(look: Look, pose: Pose, seat = true): Box[] {
  const hand = (x: number, y: number, z: number): Box => ({ x, y, z, w: 1, d: 1, h: 1, color: look.skin });

  if (pose === "stand" || pose === "step-a" || pose === "step-b") {
    // A step swings one leg and the other arm forward.
    const swing = pose === "step-a" ? 1 : pose === "step-b" ? -1 : 0;

    return [
      { x: 3 + swing, y: 2, z: 0, w: 2, d: 2, h: 4, color: look.legs },
      { x: 3 - swing, y: 4, z: 0, w: 2, d: 2, h: 4, color: look.legs },
      { x: 3, y: 2, z: 4, w: 2, d: 4, h: 5, color: look.top },
      { x: 3.5 - swing, y: 1, z: 5, w: 1, d: 1, h: 4, color: look.top },
      { x: 3.5 + swing, y: 6, z: 5, w: 1, d: 1, h: 4, color: look.top },
      hand(3.5 - swing, 1, 4),
      hand(3.5 + swing, 6, 4),
      ...head(look, 2, 9)
    ];
  }

  // Seated: the thighs lie forward on the seat and the shins hang from the knees.
  const seated: Box[] = [
    { x: 3, y: 2, z: 3, w: 4, d: 2, h: 2, color: look.legs },
    { x: 3, y: 4, z: 3, w: 4, d: 2, h: 2, color: look.legs },
    { x: 6, y: 2, z: 0, w: 1, d: 2, h: 3, color: look.legs },
    { x: 6, y: 4, z: 0, w: 1, d: 2, h: 3, color: look.legs },
    { x: 3, y: 2, z: 5, w: 2, d: 4, h: 4, color: look.top }
  ];

  if (pose === "sit" || pose === "doze") {
    seated.push({ x: 3.5, y: 1, z: 5, w: 1, d: 1, h: 4, color: look.top }, { x: 3.5, y: 6, z: 5, w: 1, d: 1, h: 4, color: look.top }, hand(3.5, 1, 4), hand(3.5, 6, 4));
  } else {
    // Typing: the forearms reach the desk, one hand up while the other is down.
    const [up, down] = pose === "type-a" ? [0.6, 0] : [0, 0.6];

    seated.push(
      { x: 3.5, y: 1, z: 6, w: 1, d: 1, h: 3, color: look.top },
      { x: 3.5, y: 6, z: 6, w: 1, d: 1, h: 3, color: look.top },
      { x: 4.5, y: 1, z: 6 + up, w: 2.5, d: 1, h: 1, color: look.top },
      { x: 4.5, y: 6, z: 6 + down, w: 2.5, d: 1, h: 1, color: look.top },
      hand(7, 1, 6 + up),
      hand(7, 6, 6 + down)
    );
  }

  // A dozing head hangs forward.
  seated.push(...(pose === "doze" ? head(look, 3, 8) : head(look, 2, 9)));

  return seat ? [...chair(), ...seated] : seated;
}

/** A person turned to the way it faces. */
export function personFacing(look: Look, pose: Pose, facing: Facing, seat = true): Box[] {
  return turned(person(look, pose, seat), facing, TILE);
}

const WOOD = "#b08357";
const WOOD_DARK = "#8a6240";
const DEVICE = "#30343d";

/** A desk with a laptop on it, for one who sits at its -x side: `glow` is the colour of the light on the laptop's
 * lid, none while nobody works at it. */
export function desk(glow: string | null): Box[] {
  const boxes: Box[] = [
    { x: 0, y: 0, z: 0, w: 5, d: 1, h: 5, color: WOOD_DARK },
    { x: 0, y: 7, z: 0, w: 5, d: 1, h: 5, color: WOOD_DARK },
    { x: 0, y: 0, z: 5, w: 6, d: 8, h: 1, color: WOOD },
    { x: 1, y: 2, z: 6, w: 3, d: 4, h: 0.4, color: DEVICE },
    { x: 4, y: 2, z: 6, w: 0.5, d: 4, h: 3, color: DEVICE }
  ];

  if (glow !== null) boxes.push({ x: 4.5, y: 3, z: 7, w: 0.2, d: 2, h: 1, color: glow, lit: true });

  return boxes;
}

const SOFA = "#6b7280";
const SOFA_DARK = "#4b5563";

/** One seat of a sofa, its back toward -x. */
export function sofa(): Box[] {
  return [
    { x: 0, y: 0, z: 0, w: 2, d: 8, h: 7, color: SOFA_DARK },
    { x: 2, y: 0, z: 0, w: 5, d: 8, h: 3, color: SOFA }
  ];
}

/** A plant in a pot. */
export function plant(): Box[] {
  return [
    { x: 3, y: 3, z: 0, w: 2, d: 2, h: 2, color: "#b4673f" },
    { x: 2, y: 2, z: 2, w: 4, d: 4, h: 4, color: "#3f9b5a" },
    { x: 3, y: 3, z: 6, w: 2, d: 2, h: 2, color: "#55b86f" }
  ];
}

/** A low table. */
export function table(): Box[] {
  return [
    { x: 3, y: 3, z: 0, w: 2, d: 2, h: 3, color: WOOD_DARK },
    { x: 1, y: 1, z: 3, w: 6, d: 6, h: 1, color: WOOD }
  ];
}

/** A water cooler. */
export function cooler(): Box[] {
  return [
    { x: 2, y: 2, z: 0, w: 4, d: 4, h: 7, color: "#e5e7eb" },
    { x: 2.5, y: 2.5, z: 7, w: 3, d: 3, h: 4, color: "#7dd3fc" },
    { x: 6, y: 3.5, z: 4, w: 0.3, d: 1, h: 1, color: "#3b82f6", lit: true }
  ];
}

/** How a machine's rack shows the machine: up and quiet, up and busy, or not answering. */
export type RackState = "quiet" | "busy" | "down";

const RACK = "#262a33";
const LAMPS: Record<RackState, [string, string]> = { quiet: ["#34d399", "#34d399"], busy: ["#fbbf24", "#34d399"], down: ["#ef4444", "#3f3f46"] };

/** A machine's rack, its lamps in one of the two beats they blink in. */
export function rack(state: RackState, beat: 0 | 1): Box[] {
  const [first, second] = LAMPS[state];
  const boxes: Box[] = [{ x: 1, y: 1, z: 0, w: 6, d: 6, h: 14, color: RACK }];

  for (let row = 0; row < 4; row += 1) {
    const z = 2 + row * 3;
    const lamp = (row + beat) % 2 === 0 ? first : second;

    // A shelf's face on each side the camera sees, and its lamp.
    boxes.push(
      { x: 7, y: 1.5, z, w: 0.15, d: 5, h: 2, color: "#3a3f4b" },
      { x: 1.5, y: 7, z, w: 5, d: 0.15, h: 2, color: "#3a3f4b" },
      { x: 7.15, y: 2 + (row % 2) * 2, z: z + 0.5, w: 0.15, d: 1, h: 1, color: lamp, lit: true },
      { x: 2 + (row % 2) * 2, y: 7.15, z: z + 0.5, w: 1, d: 0.15, h: 1, color: lamp, lit: true }
    );
  }

  return boxes;
}

/** How tall a room's wall stands, in voxels. */
export const WALL = 12;

/** One tile of a room's wall on its far side along x (`"x"`) or along y (`"y"`), with a window where `window` says
 * so. */
export function wall(side: "x" | "y", color: string, window: boolean): Box[] {
  const whole: Box = side === "x" ? { x: 0, y: 0, z: 0, w: 1, d: TILE, h: WALL, color } : { x: 0, y: 0, z: 0, w: TILE, d: 1, h: WALL, color };

  if (!window) return [whole];

  const pane: Box = side === "x" ? { x: 1, y: 2, z: 5, w: 0.15, d: 4, h: 4, color: "#bfe3ff", lit: true } : { x: 2, y: 1, z: 5, w: 4, d: 0.15, h: 4, color: "#bfe3ff", lit: true };

  return [whole, pane];
}

/** One tile of floor: a thin slab under the floor's level, so the floor's edge shows its thickness. */
export function slab(color: string): Box[] {
  return [{ x: 0, y: 0, z: -1, w: TILE, d: TILE, h: 1, color }];
}

/** A model moved to a tile of the world. */
export function atTile(boxes: readonly Box[], tileX: number, tileY: number): Box[] {
  return moved(boxes, tileX * TILE, tileY * TILE);
}
