import { pathOf, repositoryRoom, roomOf } from "./space";

import type { Facing } from "./iso";
import type { Pose } from "./models";
import type { Plan, Spot } from "./space";
import type { SpaceAgent } from "#shared/space";

// The people of the voxel space (docs/web.md, 「Live status screen」, the space): where each agent stands or sits,
// where it is bound for and how it is drawn, moved on by the time that passed. An agent with work sits at a desk of
// the room its work is in; one with none waits in the lounge; a supervisor keeps its desk in the supervisors' room.

/** What an agent is at: working, waiting for work, or switched off. */
export type Mood = "working" | "idle" | "off";

/** One person of the space. Its place is in tiles, a whole tile's own corner while it stands still. */
export interface Actor {
  name: string;
  mood: Mood;
  x: number;
  y: number;
  facing: Facing;
  pose: Pose;
  // Whether what it sits on is a chair of its own, drawn with it, rather than the sofa its tile holds.
  chair: boolean;
  // Where it is bound for, or stands; none before it is given a place.
  spot: Spot | null;
  // The tiles it has still to walk over, the next first.
  path: [number, number][];
  // The seconds since its pose's beat began, and the seconds until one who waits standing moves again.
  beat: number;
  rest: number;
}

/** Everyone in the space, by name. */
export type Cast = Map<string, Actor>;

// How fast one walks, in tiles a second; how long a step and a stroke of typing last; how long one who waits
// standing stays before moving, at least and at most.
const WALK = 3.2;
const STEP_SECONDS = 0.16;
const TYPE_SECONDS = 0.26;
const REST_LEAST = 7;
const REST_MOST = 20;

/** What an agent is at. */
export function moodOf(agent: SpaceAgent): Mood {
  if (agent.work !== null) return "working";

  return agent.enabled ? "idle" : "off";
}

/** The room an agent belongs in now: a supervisor in the supervisors' room; an agent of a role in the room of the
 * repository it works in, in the workshop where its work is in none the plan holds, and in the lounge with no
 * work. */
export function wantedRoom(plan: Plan, agent: SpaceAgent): string {
  if (agent.role === null) return "supervisors";
  if (agent.work === null) return "lounge";

  const room = agent.work.repository === null ? null : roomOf(plan, repositoryRoom(agent.work.repository));

  return room === null ? "workshop" : room.key;
}

const sameSpot = (one: Spot, other: Spot): boolean => one.x === other.x && one.y === other.y;

// The kinds of place an agent takes in its room, the first it would rather have first: one who works wants a desk,
// one switched off a sofa to doze on, and one who waits a sofa before a place to stand.
function wantedKinds(mood: Mood, supervisor: boolean): Spot["kind"][] {
  if (supervisor || mood === "working") return ["station", "stand", "sofa"];

  return ["sofa", "stand", "station"];
}

/** How one is drawn once it has reached its place: typing at a desk while it works, seated otherwise, dozing while
 * switched off, standing where it has no seat. `stroke` is which stroke of typing it is at. */
export function poseAt(spot: Spot, mood: Mood, stroke: 0 | 1): Pose {
  if (spot.kind === "stand") return "stand";
  if (mood === "off") return "doze";
  if (mood === "working" && spot.kind === "station") return stroke === 0 ? "type-a" : "type-b";

  return "sit";
}

/** The cast brought up to the agents as they now are: one who is new stands at its place at once, one whose room
 * changed is given a place there and the way to walk to it, one who keeps its room keeps its place, and one no
 * longer listed is gone. The agents are taken in their order, those switched off first among the ones that wait,
 * so the same agents take the same places every time. */
export function cast(plan: Plan, agents: readonly SpaceAgent[], held: Cast): Cast {
  const next: Cast = new Map();
  const taken: Spot[] = [];
  const order = [...agents].sort((one, other) => Number(moodOf(other) === "off") - Number(moodOf(one) === "off"));

  // Those who keep their room keep their place, so nobody is moved by another's coming.
  for (const agent of order) {
    const actor = held.get(agent.name);

    if (actor?.spot != null && actor.spot.room === wantedRoom(plan, agent) && plan.spots.some((spot) => sameSpot(spot, actor.spot!))) taken.push(actor.spot);
  }

  for (const agent of order) {
    const mood = moodOf(agent);
    const room = wantedRoom(plan, agent);
    const before = held.get(agent.name) ?? null;
    const kept = before?.spot != null && before.spot.room === room && plan.spots.some((spot) => sameSpot(spot, before.spot!));
    let spot: Spot | null = kept ? before!.spot : null;

    if (spot === null) {
      const free = plan.spots.filter((one) => one.room === room && !taken.some((other) => sameSpot(one, other)));

      for (const kind of wantedKinds(mood, agent.role === null)) {
        spot = free.find((one) => one.kind === kind) ?? null;
        if (spot !== null) break;
      }

      // A room with no place left holds one more all the same, at its first place.
      spot ??= plan.spots.find((one) => one.room === room) ?? plan.spots[0] ?? null;
      if (spot !== null) taken.push(spot);
    }

    if (spot === null) continue;

    if (before === null) {
      next.set(agent.name, { name: agent.name, mood, x: spot.x, y: spot.y, facing: spot.facing, pose: poseAt(spot, mood, 0), chair: spot.kind === "station", spot, path: [], beat: 0, rest: REST_LEAST });
      continue;
    }

    const moving = before.spot === null || !sameSpot(before.spot, spot);
    const from: [number, number] = [Math.round(before.x), Math.round(before.y)];

    next.set(agent.name, { ...before, mood, spot, path: moving ? pathOf(plan, from, [spot.x, spot.y]) : before.path });
  }

  return next;
}

function facingOf(dx: number, dy: number, before: Facing): Facing {
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? "+x" : "-x";
  if (dy !== 0) return dy > 0 ? "+y" : "-y";

  return before;
}

/** The cast moved on by the seconds that passed: one with a way to go walks along it, and one at its place takes
 * the pose of what it is at. `random` picks where one who waits standing wanders next, and `still` holds everyone
 * at their places with no walking, for a reader who asked for less motion. */
export function tick(plan: Plan, held: Cast, seconds: number, random: () => number, still = false): void {
  const standing = [...held.values()].filter((actor) => actor.path.length === 0 && actor.spot !== null).map((actor) => actor.spot!);

  for (const actor of held.values()) {
    if (actor.spot === null) continue;

    if (still && actor.path.length > 0) {
      actor.path = [];
      actor.x = actor.spot.x;
      actor.y = actor.spot.y;
    }

    if (actor.path.length > 0) {
      let left = WALK * seconds;

      while (left > 0 && actor.path.length > 0) {
        const [toX, toY] = actor.path[0]!;
        const dx = toX - actor.x;
        const dy = toY - actor.y;
        const far = Math.hypot(dx, dy);

        actor.facing = facingOf(dx, dy, actor.facing);

        if (far <= left) {
          actor.x = toX;
          actor.y = toY;
          actor.path.shift();
          left -= far;
        } else {
          actor.x += (dx / far) * left;
          actor.y += (dy / far) * left;
          left = 0;
        }
      }

      actor.beat += seconds;
      actor.pose = Math.floor(actor.beat / STEP_SECONDS) % 2 === 0 ? "step-a" : "step-b";
      actor.chair = false;

      if (actor.path.length > 0) continue;

      // Arrived: it turns the way its place faces.
      actor.beat = 0;
      actor.rest = REST_LEAST + random() * (REST_MOST - REST_LEAST);
    }

    actor.beat += seconds;
    actor.facing = actor.spot.facing;
    actor.chair = actor.spot.kind === "station";
    actor.pose = poseAt(actor.spot, actor.mood, Math.floor(actor.beat / TYPE_SECONDS) % 2 === 0 ? 0 : 1);

    // One who waits standing in the lounge strolls to another free place to stand now and then.
    if (still || actor.mood !== "idle" || actor.spot.kind !== "stand") continue;

    actor.rest -= seconds;

    if (actor.rest > 0) continue;

    actor.rest = REST_LEAST + random() * (REST_MOST - REST_LEAST);

    const free = plan.spots.filter((spot) => spot.room === actor.spot!.room && spot.kind === "stand" && !standing.some((other) => sameSpot(spot, other)));

    if (free.length === 0) continue;

    const next = free[Math.floor(random() * free.length)]!;

    standing.push(next);
    actor.path = pathOf(plan, [actor.spot.x, actor.spot.y], [next.x, next.y]);
    actor.spot = next;
  }
}
