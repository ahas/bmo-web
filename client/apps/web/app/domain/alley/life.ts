import { groundPath } from "./world";

import type { Spot, SpotKind, Vec, Workshop, World } from "./world";
import type { SpaceAgent } from "#shared/space";

// The life of the MOs in the city (docs/web.md, 「Live status screen」, the space): where each agent stands, where it
// is bound for and what it does there, moved on by the seconds that passed. One with work walks to its workshop and
// sits at a free desk; one with none strolls between the rest spots; one switched off dozes where it is.

/** What an agent is at: working, waiting for work, or switched off. */
export type Mood = "working" | "idle" | "off";

/** What a MO does where it stands. */
export type Pose = "stand" | "walk" | "sit" | "type" | "lean" | "doze";

/** One MO of the city. */
export interface Mo {
  name: string;
  mood: Mood;
  at: Vec;
  yaw: number;
  pose: Pose;
  // Where it is bound for, or stands: a desk of a workshop, a workshop's doorway, or a rest spot.
  place: Place | null;
  // The points it has still to walk through, the next first.
  path: Vec[];
  // The seconds since its pose's beat began, and the seconds it stays at a rest spot before moving on.
  beat: number;
  dwell: number;
  // The last rest spot it left, which the next draw passes over.
  left: string | null;
}

/** A place one is at. */
export type Place = { kind: "station"; workshop: string; index: number } | { kind: "doorway"; workshop: string } | { kind: "spot"; id: string };

/** Everyone in the city, by name. */
export type Cast = Map<string, Mo>;

// How fast one walks and climbs, in metres a second; how long one rests at a spot, at least and at most.
const WALK = 1.6;
const CLIMB = 0.9;
const DWELL_LEAST = 12;
const DWELL_MOST = 45;

// How much each kind of rest spot draws one, against the others.
const DRAW: Record<SpotKind, number> = { noodle: 3, rooftop: 2, arcade: 2.5, vending: 2, stairs: 1.5, awning: 1.5, cat: 1.2, balcony: 1.2 };

/** What an agent is at. */
export function moodOf(agent: SpaceAgent): Mood {
  if (agent.work !== null) return "working";

  return agent.enabled ? "idle" : "off";
}

/** The workshop an agent with work belongs in: a supervisor's is MO Co.; an agent of a role works in the workshop
 * of its repository, in the open workshop where the city holds none for it. */
export function workshopOf(world: World, agent: SpaceAgent): Workshop | null {
  if (agent.role === null) return world.workshops.find((one) => one.kind === "supervisors") ?? null;
  if (agent.work === null) return null;

  const key = agent.work.repository === null ? null : `repository:${agent.work.repository}`;

  return world.workshops.find((one) => one.key === key) ?? world.workshops.find((one) => one.kind === "open") ?? null;
}

const samePlace = (one: Place | null, other: Place | null): boolean => JSON.stringify(one) === JSON.stringify(other);

/** The point a place is at and the way one faces there. */
export function placeAt(world: World, place: Place): { at: Vec; yaw: number; pose: Pose; spot: Spot | null } {
  if (place.kind === "spot") {
    const spot = world.spots.find((one) => one.id === place.id)!;

    return { at: spot.at, yaw: spot.yaw, pose: spot.pose, spot };
  }

  const workshop = world.workshops.find((one) => one.key === place.workshop)!;

  if (place.kind === "doorway") return { at: workshop.stand, yaw: 0, pose: "stand", spot: null };

  const station = workshop.stations[place.index]!;

  return { at: station.at, yaw: station.yaw, pose: "type", spot: null };
}

// Who holds each place now, so a desk or a stool is taken once.
function taken(cast: Cast, except: string): Set<string> {
  const held = new Set<string>();

  for (const mo of cast.values()) if (mo.name !== except && mo.place !== null) held.add(JSON.stringify(mo.place));

  return held;
}

// The place an agent with work is bound for: a free desk of its workshop, else its doorway.
function workPlace(world: World, cast: Cast, agent: SpaceAgent): Place | null {
  const workshop = workshopOf(world, agent);

  if (workshop === null) return null;

  const held = taken(cast, agent.name);

  for (let index = 0; index < workshop.stations.length; index += 1) {
    const place: Place = { kind: "station", workshop: workshop.key, index };

    if (!held.has(JSON.stringify(place))) return place;
  }

  return { kind: "doorway", workshop: workshop.key };
}

// A rest spot drawn by weight among the free ones, passing over the one just left.
function restPlace(world: World, cast: Cast, mo: Mo, draw: () => number): Place | null {
  const held = taken(cast, mo.name);
  const free = world.spots.filter((spot) => spot.id !== mo.left && !held.has(JSON.stringify({ kind: "spot", id: spot.id })));

  if (free.length === 0) return null;

  const weights = free.map((spot) => DRAW[spot.kind]);
  let roll = draw() * weights.reduce((sum, weight) => sum + weight, 0);

  for (let at = 0; at < free.length; at += 1) {
    roll -= weights[at]!;
    if (roll <= 0) return { kind: "spot", id: free[at]!.id };
  }

  return { kind: "spot", id: free[free.length - 1]!.id };
}

// The way from where one stands to a place: over the ground to the place's foot, then its climb.
function wayTo(world: World, from: Vec, place: Place): Vec[] {
  const target = placeAt(world, place);
  const foot = target.spot === null ? target.at : target.spot.foot;
  const way = groundPath(world, from, foot);

  if (target.spot !== null && target.spot.climb.length > 0) way.push(...target.spot.climb);

  return way;
}

/** A supervisor's desk at MO Co., where it stands between rounds and types while it answers a room. */
function supervisorPlace(world: World, cast: Cast, agent: SpaceAgent): Place | null {
  const workshop = workshopOf(world, agent);

  if (workshop === null) return null;

  const held = taken(cast, agent.name);

  for (let index = 0; index < workshop.stations.length; index += 1) {
    const place: Place = { kind: "station", workshop: workshop.key, index };

    if (!held.has(JSON.stringify(place))) return place;
  }

  return { kind: "doorway", workshop: workshop.key };
}

/** The cast brought up to the listing: everyone listed is in it, with the mood the listing says, bound for the
 * place that mood wants; whoever left the listing is gone. */
export function cast(world: World, agents: readonly SpaceAgent[], held: Cast, draw: () => number): Cast {
  const next: Cast = new Map();

  for (const agent of agents) {
    const mood = moodOf(agent);
    const was = held.get(agent.name);
    const mo: Mo = was ?? { name: agent.name, mood, at: { x: 0, y: 0, z: 0 }, yaw: 0, pose: "stand", place: null, path: [], beat: 0, dwell: 0, left: null };

    next.set(agent.name, mo);

    const wanted = agent.role === null ? supervisorPlace(world, next, agent) : mood === "working" ? workPlace(world, next, agent) : mo.place?.kind === "spot" ? mo.place : restPlace(world, next, mo, draw);

    if (was === undefined) {
      // One who arrives stands at its place at once, as if it had always been there.
      mo.place = wanted;

      if (wanted !== null) {
        const there = placeAt(world, wanted);

        mo.at = { ...there.at };
        mo.yaw = there.yaw;
        mo.pose = mood === "off" ? "doze" : mood === "working" ? there.pose : there.pose === "type" ? "stand" : there.pose;
      }

      mo.dwell = DWELL_LEAST + draw() * (DWELL_MOST - DWELL_LEAST);
    } else if (!samePlace(mo.place, wanted) && mood !== "off") {
      if (mo.place?.kind === "spot") mo.left = mo.place.id;
      mo.place = wanted;
      mo.path = wanted === null ? [] : wayTo(world, mo.at, wanted);
      mo.pose = mo.path.length > 0 ? "walk" : mo.pose;
    }

    mo.mood = mood;
  }

  return next;
}

/** Everyone moved on by `seconds`: those with a way still to walk walk it, those at a rest spot count down their
 * stay and set off for another, and those arrived hold the pose their place gives. With `still`, nobody walks or
 * strolls: each is at its place at once. */
export function tick(world: World, cast: Cast, seconds: number, draw: () => number, still = false): void {
  for (const mo of cast.values()) {
    mo.beat += seconds;

    if (mo.mood === "off") {
      mo.pose = "doze";
      continue;
    }

    if (mo.path.length > 0) {
      if (still) {
        const last = mo.path[mo.path.length - 1]!;

        mo.at = { ...last };
        mo.path = [];
      } else {
        let left = seconds * (mo.path[0]!.y !== mo.at.y ? CLIMB : WALK);

        while (left > 0 && mo.path.length > 0) {
          const next = mo.path[0]!;
          const dx = next.x - mo.at.x;
          const dy = next.y - mo.at.y;
          const dz = next.z - mo.at.z;
          const far = Math.hypot(dx, dy, dz);

          if (far <= left) {
            mo.at = { ...next };
            mo.path.shift();
            left -= far;
          } else {
            mo.at = { x: mo.at.x + (dx / far) * left, y: mo.at.y + (dy / far) * left, z: mo.at.z + (dz / far) * left };
            left = 0;
          }

          if (Math.hypot(dx, dz) > 0.01) mo.yaw = Math.atan2(dx, dz);
        }

        if (mo.path.length > 0) {
          mo.pose = "walk";
          continue;
        }
      }
    }

    // Arrived.
    if (mo.place === null) {
      mo.pose = "stand";
      continue;
    }

    const there = placeAt(world, mo.place);

    mo.yaw = there.yaw;
    mo.pose = mo.mood === "working" ? there.pose : there.pose === "type" ? "stand" : there.pose;

    if (mo.place.kind === "spot" && mo.mood === "idle") {
      mo.dwell -= seconds;

      if (mo.dwell <= 0) {
        const next = restPlace(world, cast, mo, draw);

        mo.dwell = DWELL_LEAST + draw() * (DWELL_MOST - DWELL_LEAST);

        if (next !== null && !samePlace(next, mo.place)) {
          mo.left = mo.place.id;
          mo.place = next;
          mo.path = still ? [] : wayTo(world, mo.at, next);

          if (still) {
            const to = placeAt(world, next);

            mo.at = { ...to.at };
          } else {
            mo.pose = "walk";
          }
        }
      }
    }
  }
}
