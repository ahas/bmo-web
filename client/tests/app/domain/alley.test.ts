import { describe, expect, test } from "bun:test";

import { cast, moodOf, placeAt, tick, workshopOf } from "../../../apps/web/app/domain/alley/life";
import { groundPath, random, seedOf, walkable, worldOf } from "../../../apps/web/app/domain/alley/world";

import type { SpaceAgent, SpaceView } from "../../../apps/web/shared/space";

// The city of the live status screen's space and the life in it (docs/web.md, 「Live status screen」, the space):
// the same listing stands the same city, every machine is a district and every repository a lit workshop, the
// ground between them is walked, and the MOs go where their mood sends them.

const WORK = { repository: "repo-a", chatId: null, place: "Repo A", title: null, since: null, provider: null, model: null, log: null, session: null, stop: null };

function listing(): Pick<SpaceView, "nodes" | "repositories" | "agents"> {
  return {
    nodes: [
      { name: "node-a", label: "Node A", busy: true },
      { name: "node-b", label: "Node B", busy: false }
    ],
    repositories: [
      { name: "repo-a", label: "Repo A", node: "node-a" },
      { name: "repo-b", label: "Repo B", node: "node-b" },
      { name: "repo-c", label: "Repo C", node: null }
    ],
    agents: [
      { name: "agent-a", label: "Agent A", role: null, enabled: true, road: null, work: null },
      { name: "worker-01", label: "worker-01", role: "worker", enabled: true, road: null, work: WORK },
      { name: "worker-02", label: "worker-02", role: "worker", enabled: true, road: null, work: null },
      { name: "worker-03", label: "worker-03", role: "worker", enabled: false, road: null, work: null }
    ]
  };
}

describe("the city", () => {
  test("stands the same for the same listing and another for another", () => {
    const one = worldOf(listing());
    const same = worldOf(listing());
    const other = worldOf({ ...listing(), nodes: [{ name: "node-z", label: "Node Z", busy: false }] });

    expect(seedOf(listing())).toBe(one.seed);
    expect(JSON.stringify(same.blocks)).toBe(JSON.stringify(one.blocks));
    expect(JSON.stringify(other.blocks)).not.toBe(JSON.stringify(one.blocks));
  });

  test("gives every machine a district with its sign and racks, every repository a workshop with four desks, and the supervisors and the open work workshops of their own", () => {
    const world = worldOf(listing());

    expect(world.districts.map((district) => district.name)).toEqual(["node-a", "node-b"]);
    for (const district of world.districts) {
      expect(district.sign.text).toBe(district.label);
      expect(district.lots.length).toBeGreaterThanOrEqual(3);
    }

    const keys = world.workshops.map((workshop) => workshop.key).sort();

    expect(keys).toEqual(["open", "repository:repo-a", "repository:repo-b", "repository:repo-c", "supervisors"]);
    for (const workshop of world.workshops) expect(workshop.stations).toHaveLength(4);
    expect(world.workshops.find((workshop) => workshop.kind === "supervisors")?.label).toBe("MO Co.");
  });

  test("holds rest spots of every kind, each reached from the ground", () => {
    const world = worldOf(listing());
    const kinds = new Set(world.spots.map((spot) => spot.kind));

    for (const kind of ["noodle", "arcade", "vending", "awning", "cat", "stairs", "balcony"]) expect(kinds.has(kind as never)).toBe(true);
    for (const spot of world.spots) {
      const [column, row] = [Math.floor(spot.foot.x / world.cell), Math.floor(spot.foot.z / world.cell)];
      const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => walkable(world, column + dx, row + dz)));

      expect(near).toBe(true);
    }
  });

  test("is walked across the ground from a workshop's door to a stool at the noodle stall", () => {
    const world = worldOf(listing());
    const workshop = world.workshops.find((one) => one.kind === "repository")!;
    const stool = world.spots.find((spot) => spot.kind === "noodle")!;
    const way = groundPath(world, workshop.door, stool.foot);

    expect(way.length).toBeGreaterThan(2);
    expect(way[way.length - 1]).toEqual({ x: stool.foot.x, y: 0, z: stool.foot.z });
    for (const step of way.slice(0, -1)) expect(walkable(world, Math.floor(step.x / world.cell), Math.floor(step.z / world.cell))).toBe(true);
  });
});

describe("the life", () => {
  test("seats a supervisor at MO Co., an agent with work at a desk of its repository's workshop, one with none at a rest spot, and one switched off dozing", () => {
    const world = worldOf(listing());
    const agents = listing().agents;
    const folk = cast(world, agents, new Map(), random(7));

    expect(moodOf(agents[1]!)).toBe("working");
    expect(folk.get("agent-a")!.place).toEqual({ kind: "station", workshop: "supervisors", index: 0 });
    expect(folk.get("worker-01")!.place).toEqual({ kind: "station", workshop: "repository:repo-a", index: 0 });
    expect(folk.get("worker-02")!.place?.kind).toBe("spot");
    expect(folk.get("worker-03")!.pose).toBe("doze");
    expect(workshopOf(world, agents[1]!)?.key).toBe("repository:repo-a");
  });

  test("walks one whose work begins to its desk, and one whose work ended out to a rest spot, over the seconds that pass", () => {
    const world = worldOf(listing());
    const draw = random(3);
    const agents = listing().agents;
    let folk = cast(world, agents, new Map(), draw);
    const idle = folk.get("worker-02")!;
    const from = { ...idle.at };

    // Work comes: the next cast sends it to a desk, and the ticks walk it there.
    const working: SpaceAgent = { ...agents[2]!, work: { ...WORK, repository: "repo-b" } };

    folk = cast(world, [agents[0]!, agents[1]!, working, agents[3]!], folk, draw);

    const mo = folk.get("worker-02")!;

    expect(mo.place).toEqual({ kind: "station", workshop: "repository:repo-b", index: 0 });
    expect(mo.pose).toBe("walk");

    for (let at = 0; at < 600 && mo.path.length > 0; at += 1) tick(world, folk, 0.1, draw);

    const desk = placeAt(world, mo.place!);

    expect(mo.at.x).toBeCloseTo(desk.at.x, 3);
    expect(mo.at.z).toBeCloseTo(desk.at.z, 3);
    expect(mo.pose).toBe("type");
    expect(Math.hypot(mo.at.x - from.x, mo.at.z - from.z)).toBeGreaterThan(0);

    // A reader who asked for less motion sees everyone at their place at once.
    folk = cast(world, agents, folk, draw);
    tick(world, folk, 0.1, draw, true);
    expect(folk.get("worker-02")!.path).toEqual([]);
    expect(folk.get("worker-02")!.place?.kind).toBe("spot");
  });

  test("moves one who waits from one rest spot to another once its stay is over, never straight back to the one it left", () => {
    const world = worldOf(listing());
    const draw = random(11);
    const folk = cast(world, listing().agents, new Map(), draw);
    const mo = folk.get("worker-02")!;
    const first = mo.place;

    mo.dwell = 0.05;
    tick(world, folk, 0.1, draw);
    expect(mo.place).not.toEqual(first);
    expect(mo.left).toBe((first as { id: string }).id);
    expect(mo.pose).toBe("walk");
  });
});
