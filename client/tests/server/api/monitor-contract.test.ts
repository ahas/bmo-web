import { describe, expect, test } from "bun:test";

import { historySample, LIVE_CHART_SECONDS } from "../../../apps/web/shared/hardware";
import { capturedMachines, capturedReadings } from "../../support/node-machines";
import { routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { LiveRange, MachineHardware } from "../../../apps/web/shared/types";

// The monitor's reads against the node service's answers as a running one gives them (tests/support/node-machines.ts):
// each machine's reading reaches the screen whole, the figures a tile and a monitor draw stand in it under the names
// the drawing reads them by, and the live record is asked and answered on the console's own clock (docs/web.md,
// 「Monitor screen」), never an instant the browser sends.

const node = standIn("NODE", (one) => {
  const [path, query] = one.path.split("?") as [string, string | undefined];
  const params = new URLSearchParams(query ?? "");

  if (path === "/machines") return answer(capturedMachines());
  if (path === "/machines/local/readings") return answer(capturedReadings("local", Number(params.get("after"))));

  return answer({ code: "no-route", error: "Not served here." }, 404);
});

const machines = await routeOf<MachineHardware[]>("../../apps/web/server/api/hardware/machines.get");
const live = await routeOf<LiveRange>("../../apps/web/server/api/hardware/machines/[name]/live.get");

// What a tile draws of every machine: the CPU's and each GPU's use and temperature.
const TILE_FIGURES = ["cpu|use", "cpu|temp", "gpu0|use", "gpu0|temp"];

describe("the node service's captured answer", () => {
  test("stands every machine's reading whole, its moment in seconds, with every figure a tile draws", async () => {
    const before = Math.floor(Date.now() / 1000);
    const read = await machines({});

    expect(read.map((one) => one.name)).toEqual(["local", "node-a"]);

    for (const machine of read) {
      expect(machine.hardware).not.toBeNull();
      expect(machine.readAt).toBeGreaterThanOrEqual(before - 1);

      const sample = historySample(machine.hardware!);

      for (const key of TILE_FIGURES) expect(typeof sample[key]).toBe("number");
      expect(typeof sample["memory|gb"]).toBe("number");
    }
  });

  test("a first live fill is the console's last minute, answered with the console's clock and every figure a tile draws", async () => {
    const before = Math.floor(Date.now() / 1000);
    const range = await live({ params: { name: "local" }, query: { metrics: "use,temp" } });
    const after = Number(new URLSearchParams(node.asked.at(-1)!.path.split("?")[1]).get("after"));

    expect(after / 1000).toBeGreaterThanOrEqual(before - LIVE_CHART_SECONDS);
    expect(after / 1000).toBeLessThanOrEqual(range.now - LIVE_CHART_SECONDS);
    expect(range.now).toBeGreaterThanOrEqual(before);
    expect(range.at.length).toBeGreaterThan(0);
    expect(range.at.every((at) => at > range.now - LIVE_CHART_SECONDS && at <= range.now)).toBe(true);
    expect(Object.keys(range.series)).toEqual(expect.arrayContaining(TILE_FIGURES));
    expect(Object.keys(range.series).every((key) => key.endsWith("|use") || key.endsWith("|temp"))).toBe(true);
  });
});
