import { describe, expect, test } from "bun:test";

import { cast, moodOf, poseAt, tick, wantedRoom } from "../../../apps/web/app/domain/voxel/actors";
import { behind, bounds, faces, facesOf, floorAt, painted, project, scaleOf, shade, turned } from "../../../apps/web/app/domain/voxel/iso";
import { TILE, hashOf, lookOf, personFacing, roleColor } from "../../../apps/web/app/domain/voxel/models";
import { WORK_GLOW, fixtures, inOrder, people } from "../../../apps/web/app/domain/voxel/scene";
import { pathOf, planOf, repositoryRoom, roomAt, roomOf, tileAt } from "../../../apps/web/app/domain/voxel/space";

import type { Cast } from "../../../apps/web/app/domain/voxel/actors";
import type { Box, Facing } from "../../../apps/web/app/domain/voxel/iso";
import type { Pose } from "../../../apps/web/app/domain/voxel/models";
import type { SpaceAgent, SpaceView, SpaceWork } from "../../../apps/web/shared/space";

// The voxel space the live status screen draws (docs/web.md, 「Live status screen」, the space): how a box is put on
// the screen and in what order boxes are painted, how a floor is planned from the machines and the repositories and
// how one walks over it, where each agent belongs and how it is drawn, and what is painted of all of it.

const box = (x: number, y: number, z: number, w: number, d: number, h: number): Box => ({ x, y, z, w, d, h, color: "#808080" });

function work(repository: string | null): SpaceWork {
  return { repository, chatId: null, place: repository ?? "folder", title: "a task", since: 1_000, provider: "provider-a", model: "model-a", log: "run-a", session: null, stop: null };
}

function agent(name: string, role: string | null, over: Partial<SpaceAgent> = {}): SpaceAgent {
  return { name, label: name, role, enabled: true, road: null, work: null, ...over };
}

function view(agents: SpaceAgent[]): SpaceView {
  return {
    readAt: 0,
    nodes: [{ name: "node-a", label: "Node A", busy: false }, { name: "node-b", label: "Node B", busy: true }],
    repositories: [{ name: "repo-a", label: "Repo A", node: "node-a" }, { name: "repo-b", label: "Repo B", node: "node-b" }, { name: "repo-c", label: "Repo C", node: null }],
    agents,
    waiting: []
  };
}

const AGENTS = [agent("agent-a", null), agent("role-a-01", "role-a"), agent("role-a-02", "role-a"), agent("role-b-01", "role-b", { enabled: false })];

describe("the geometry", () => {
  test("puts x to the right and down, y to the left and down and z up, and finds the floor under a pixel again", () => {
    const scale = scaleOf(2);

    expect(project(scale, 1, 0, 0)).toEqual([4, 2]);
    expect(project(scale, 0, 1, 0)).toEqual([-4, 2]);
    expect(project(scale, 0, 0, 1)).toEqual([0, -5]);
    expect(floorAt(scale, ...project(scale, 7, 3, 0))).toEqual([7, 3]);
  });

  test("paints what stands behind first, whichever order the boxes come in", () => {
    const scale = scaleOf(2);
    // A tall box at the back and a low one before it: the low one is in front, so it is painted after.
    const back = box(0, 0, 0, 2, 2, 10);
    const front = box(3, 0, 0, 2, 2, 2);
    const top = box(0, 0, 10, 2, 2, 1);

    expect(behind(back, front)).toBe(true);
    expect(behind(front, back)).toBe(false);
    for (const order of [[back, front, top], [top, front, back], [front, top, back]]) {
      const drawn = painted(scale, order);

      expect(drawn.indexOf(back)).toBeLessThan(drawn.indexOf(front));
      expect(drawn.indexOf(back)).toBeLessThan(drawn.indexOf(top));
    }
  });

  test("shows a box's three near faces, the top the lightest and the one toward +x the darkest", () => {
    const scale = scaleOf(1);
    const shown = facesOf(scale, box(0, 0, 0, 1, 1, 1));

    expect(shown).toHaveLength(3);
    expect(shown.map((face) => face.color)).toEqual([shade("#808080", 0.94), shade("#808080", 0.76), shade("#808080", 1.16)]);
    expect(shown.every((face) => face.points.length === 4)).toBe(true);
    // A face that gives its own light keeps its colour on every side.
    expect(new Set(facesOf(scale, { ...box(0, 0, 0, 1, 1, 1), lit: true }).map((face) => face.color))).toEqual(new Set(["#808080"]));
    expect(faces(scale, [box(0, 0, 0, 1, 1, 1), box(2, 0, 0, 1, 1, 1)])).toHaveLength(6);
  });

  test("turns a model inside its footprint, which stays where it stands", () => {
    const model = [box(1, 2, 0, 3, 1, 4)];

    for (const facing of ["+x", "+y", "-x", "-y"] as Facing[]) {
      const [one] = turned(model, facing, TILE) as [Box];

      expect(one.x >= 0 && one.y >= 0 && one.x + one.w <= TILE && one.y + one.d <= TILE).toBe(true);
      expect([one.z, one.h]).toEqual([0, 4]);
    }

    expect(turned(model, "+y", TILE)[0]).toMatchObject({ x: 2, y: 1, w: 1, d: 3 });
    expect(turned(model, "-x", TILE)[0]).toMatchObject({ x: 4, y: 5, w: 3, d: 1 });
  });
});

describe("a person", () => {
  test("looks the same every time: its top by its role, the rest by its own name, a supervisor in a headset", () => {
    expect(lookOf("role-a-01", "role-a")).toEqual(lookOf("role-a-01", "role-a"));
    expect(lookOf("role-a-01", "role-a").top).toBe(roleColor("role-a"));
    expect(lookOf("role-a-02", "role-a").top).toBe(roleColor("role-a"));
    expect(lookOf("agent-a", null).headset).toBe(true);
    expect(lookOf("role-a-01", "role-a").headset).toBe(false);
    expect(hashOf("role-a")).toBe(hashOf("role-a"));
  });

  test("stands inside its own tile in every pose, whichever way it faces", () => {
    const look = lookOf("role-a-01", "role-a");
    const scale = scaleOf(2);

    for (const pose of ["stand", "step-a", "step-b", "sit", "type-a", "type-b", "doze"] as Pose[]) {
      for (const facing of ["+x", "+y", "-x", "-y"] as Facing[]) {
        const boxes = personFacing(look, pose, facing);

        expect(boxes.length).toBeGreaterThan(5);
        for (const one of boxes) {
          expect({ pose, facing, inside: one.x >= -1 && one.y >= -1 && one.x + one.w <= TILE + 1 && one.y + one.d <= TILE + 1 && one.z >= 0 }).toEqual({ pose, facing, inside: true });
        }

        const [left, top, right, bottom] = bounds(scale, boxes);

        expect(right - left).toBeGreaterThan(0);
        expect(bottom - top).toBeGreaterThan(0);
      }
    }
  });
});

describe("the plan", () => {
  const plan = planOf(view(AGENTS));

  test("holds the supervisors' room, the lounge and the workshop, then a room to every machine and repository", () => {
    expect(plan.rooms.map((room) => room.key)).toEqual(["supervisors", "lounge", "workshop", "node:node-a", "repository:repo-a", "repository:repo-c", "node:node-b", "repository:repo-b"]);
    expect(roomOf(plan, repositoryRoom("repo-b"))).toMatchObject({ kind: "repository", label: "Repo B", node: "Node B" });
    // The floor is laid out most nearly square: no narrower layout of the same rooms has shorter sides together.
    expect(Math.abs(plan.w - plan.d)).toBeLessThan(Math.max(plan.w, plan.d));
  });

  test("lays the rooms out with a path between any two, none over another", () => {
    for (const one of plan.rooms) {
      for (const other of plan.rooms) {
        if (one === other) continue;

        const apart = one.x + one.w < other.x || other.x + other.w < one.x || one.y + one.d < other.y || other.y + other.d < one.y;

        expect({ one: one.key, other: other.key, apart }).toEqual({ one: one.key, other: other.key, apart: true });
      }
    }

    expect(roomAt(plan, 0, 0)).toBeNull();
  });

  test("gives every agent a place: a desk to each supervisor, a seat or a place to stand in the lounge to each agent of a role", () => {
    const of = (room: string, kind: string): number => plan.spots.filter((spot) => spot.room === room && spot.kind === kind).length;

    expect(of("supervisors", "station")).toBe(1);
    expect(of("lounge", "sofa") + of("lounge", "stand")).toBeGreaterThanOrEqual(3);
    expect(of("repository:repo-a", "station")).toBe(4);
    // A desk stands before its seat, and blocks its tile.
    const desk = plan.things.find((thing) => thing.kind === "desk")!;

    expect(tileAt(plan, desk.x, desk.y)?.blocked).toBe(true);
  });

  test("walks from the lounge to a desk along the paths and in through a room's near side, never through a wall", () => {
    const from = plan.spots.find((spot) => spot.room === "lounge" && spot.kind === "stand")!;
    const to = plan.spots.find((spot) => spot.room === "repository:repo-b" && spot.kind === "station")!;
    const path = pathOf(plan, [from.x, from.y], [to.x, to.y]);

    expect(path.length).toBeGreaterThan(3);
    expect(path.at(-1)).toEqual([to.x, to.y]);

    let [x, y] = [from.x, from.y];

    for (const [nextX, nextY] of path) {
      expect(Math.abs(nextX - x) + Math.abs(nextY - y)).toBe(1);

      // A wall stands on the far edges of a room's first row and column: no step crosses one.
      const entered = tileAt(plan, Math.max(x, nextX), Math.max(y, nextY))!;

      expect(nextX !== x ? entered.wallX : entered.wallY).toBe(false);
      // No step lands on what a thing stands on, the walk's own end aside.
      if (nextX !== to.x || nextY !== to.y) expect(tileAt(plan, nextX, nextY)!.blocked).toBe(false);
      [x, y] = [nextX, nextY];
    }

    expect(pathOf(plan, [from.x, from.y], [from.x, from.y])).toEqual([]);
  });
});

describe("the people", () => {
  const plan = planOf(view(AGENTS));

  test("belong where what they are at puts them", () => {
    expect(wantedRoom(plan, agent("agent-a", null))).toBe("supervisors");
    expect(wantedRoom(plan, agent("role-a-01", "role-a"))).toBe("lounge");
    expect(wantedRoom(plan, agent("role-a-01", "role-a", { work: work("repo-b") }))).toBe("repository:repo-b");
    // Work in no repository the plan holds goes to the workshop.
    expect(wantedRoom(plan, agent("role-a-01", "role-a", { work: work(null) }))).toBe("workshop");
    expect(wantedRoom(plan, agent("role-a-01", "role-a", { work: work("repo-gone") }))).toBe("workshop");
    expect([moodOf(AGENTS[1]!), moodOf(AGENTS[3]!), moodOf(agent("x", "role-a", { work: work(null) }))]).toEqual(["idle", "off", "working"]);
  });

  test("stand at their places at once when first seen: a supervisor at its desk, one switched off dozing on the sofa", () => {
    const folk = cast(plan, AGENTS, new Map());

    expect(folk.get("agent-a")).toMatchObject({ pose: "sit", chair: true, path: [] });
    expect(folk.get("agent-a")!.spot).toMatchObject({ room: "supervisors", kind: "station" });
    expect(folk.get("role-b-01")).toMatchObject({ mood: "off", pose: "doze", chair: false });
    expect(folk.get("role-b-01")!.spot).toMatchObject({ room: "lounge", kind: "sofa" });
    // No two take the same place.
    const places = [...folk.values()].map((actor) => `${actor.spot!.x},${actor.spot!.y}`);

    expect(new Set(places).size).toBe(places.length);
  });

  test("walk to the room of a run that begins, type at its desk, and walk back when it ends", () => {
    let folk: Cast = cast(plan, AGENTS, new Map());
    const home = { ...folk.get("role-a-01")!.spot! };
    const busy = AGENTS.map((one) => (one.name === "role-a-01" ? { ...one, work: work("repo-a") } : one));

    folk = cast(plan, busy, folk);

    const walker = folk.get("role-a-01")!;

    expect(walker.spot).toMatchObject({ room: "repository:repo-a", kind: "station" });
    expect(walker.path.length).toBeGreaterThan(0);
    // Another agent keeps its place while this one moves.
    expect(folk.get("role-a-02")!.path).toEqual([]);

    tick(plan, folk, 0.1, () => 0.5);
    expect(["step-a", "step-b"]).toContain(walker.pose);
    expect(roomAt(plan, walker.x, walker.y)?.key ?? "path").not.toBe("repository:repo-a");

    for (let at = 0; at < 400 && walker.path.length > 0; at += 1) tick(plan, folk, 0.1, () => 0.5);

    expect([walker.x, walker.y]).toEqual([walker.spot!.x, walker.spot!.y]);
    tick(plan, folk, 0.1, () => 0.5);
    expect(["type-a", "type-b"]).toContain(walker.pose);
    expect(walker).toMatchObject({ chair: true, facing: walker.spot!.facing });

    // The run ends: it is given its place in the lounge again and the way back.
    folk = cast(plan, AGENTS, folk);
    expect(folk.get("role-a-01")!.spot!.room).toBe("lounge");
    expect(folk.get("role-a-01")!.path.length).toBeGreaterThan(0);
    expect(home.room).toBe("lounge");
  });

  test("stand at their places with no walking for a reader who asked for less motion, and one no longer listed is gone", () => {
    let folk: Cast = cast(plan, AGENTS, new Map());

    folk = cast(plan, AGENTS.map((one) => (one.name === "role-a-02" ? { ...one, work: work("repo-b") } : one)), folk);
    tick(plan, folk, 0.016, () => 0.5, true);

    const moved = folk.get("role-a-02")!;

    expect(moved.path).toEqual([]);
    expect([moved.x, moved.y]).toEqual([moved.spot!.x, moved.spot!.y]);
    expect(cast(plan, AGENTS.slice(0, 2), folk).has("role-a-02")).toBe(false);
  });

  test("are drawn typing only at a desk while they work, dozing while switched off", () => {
    const station = { room: "r", kind: "station" as const, x: 0, y: 0, facing: "+x" as const };

    expect(poseAt(station, "working", 0)).toBe("type-a");
    expect(poseAt(station, "working", 1)).toBe("type-b");
    expect(poseAt(station, "idle", 0)).toBe("sit");
    expect(poseAt({ ...station, kind: "sofa" }, "off", 0)).toBe("doze");
    expect(poseAt({ ...station, kind: "stand" }, "working", 0)).toBe("stand");
  });
});

describe("what is painted", () => {
  const seen = view(AGENTS.map((one) => (one.name === "role-a-01" ? { ...one, work: work("repo-a") } : one)));
  const plan = planOf(seen);
  const folk = cast(plan, seen.agents, new Map());

  test("shows a chair at a seat nobody sits on and a light on the desk of one who works", () => {
    const drawn = fixtures(plan, seen.nodes, folk, 0);
    const worker = folk.get("role-a-01")!;
    const chairs = drawn.filter((one) => one.sprite.startsWith("chair:"));

    expect(chairs.some((chair) => chair.x === worker.spot!.x && chair.y === worker.spot!.y)).toBe(false);
    expect(chairs.length).toBe(plan.things.filter((thing) => thing.kind === "desk").length - 2);
    expect(drawn.filter((one) => one.sprite === `desk:+x:${WORK_GLOW}`)).toHaveLength(1);
    // A machine's racks blink, quicker lamps while work goes on it.
    expect(drawn.filter((one) => one.sprite === "rack:busy:0")).toHaveLength(3);
    expect(fixtures(plan, seen.nodes, folk, 1).filter((one) => one.sprite === "rack:quiet:1")).toHaveLength(3);
    expect(drawn.find((one) => one.sprite.startsWith("desk:"))!.boxes().length).toBeGreaterThan(3);
  });

  test("paints the farthest first, and a person after the sofa it sits on and before the desk it sits at", () => {
    const order = inOrder([...fixtures(plan, seen.nodes, folk, 0), ...people(folk, seen.agents)]);
    const at = (pick: (one: (typeof order)[number]) => boolean): number => order.findIndex(pick);
    const worker = folk.get("role-a-01")!;
    const dozer = folk.get("role-b-01")!;

    for (let index = 1; index < order.length; index += 1) expect(order[index]!.depth).toBeGreaterThanOrEqual(order[index - 1]!.depth);

    expect(at((one) => one.id === "role-a-01")).toBeLessThan(at((one) => one.sprite.startsWith("desk:") && one.x === worker.spot!.x + 1 && one.y === worker.spot!.y));
    expect(at((one) => one.sprite.startsWith("sofa:") && one.x === dozer.spot!.x && one.y === dozer.spot!.y)).toBeLessThan(at((one) => one.id === "role-b-01"));
    // A person's sprite is named by everything it is drawn from, so one drawn once is drawn from its picture after.
    expect(order.find((one) => one.id === "role-b-01")!.sprite).toBe("person:role-b-01:role-b:doze:+x:false");
  });
});
