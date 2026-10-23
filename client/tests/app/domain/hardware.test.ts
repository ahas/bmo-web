import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { againstText, capacityText, celsiusText, cpuLimitOf, driveSizeText, fillCriteria, fillHeat, fillText, fillWidest, gigabytesValue, gpuShortName, keepLive, LIVE_CHART_SECONDS, liveKeeping, loadText, machineName, mhzFigure, mhzText, monitorMachines, percentText, rangeLivePoints, rpmText, spanPollMs, spanUrl, storageKindWord, temperatureCriteria, temperatureHeat, uptimeText, vramText, vramWidest, wattsFigure, wattsText } from "../../../apps/web/app/domain/hardware";

import type { CpuView, HardwareView, MachineHardware, MemoryView, MonitorNode } from "../../../apps/web/shared/types";

// A reading with every figure missing but the ones a test gives.
function hardwareView(cpu: Partial<CpuView>, memory: Partial<MemoryView> = {}): HardwareView {
  return {
    host: null,
    kernel: null,
    os: null,
    hostOs: null,
    wsl: false,
    sensorLibrary: null,
    uptimeSeconds: null,
    load: null,
    cpu: { model: null, threadCount: 0, usage: null, celsius: null, limitCelsius: null, mhz: null, peakMhz: null, watts: null, chip: null, sensors: [], ...cpu },
    memory: { usedKb: null, totalKb: null, share: null, swapUsedKb: null, swapTotalKb: null, swapShare: null, ...memory },
    gpus: [],
    storage: [],
    board: { sensors: [], fans: [] },
    services: { running: null, failed: null },
  };
}

function node(name: string, kind: MonitorNode["kind"], thisMachine = false): MonitorNode {
  return { name, label: name.toUpperCase(), kind, thisMachine };
}

describe("monitorMachines", () => {
  test("this machine first, then the nodes in the list's order, each read and opened by its own name", () => {
    expect(monitorMachines([node("agent-a", "hub"), node("alpha", "hub"), node("pc-node", "ssh")])).toEqual([
      { key: "local", label: null, kind: "local", url: "/api/hardware/machines/local", historyUrl: "/api/hardware/machines/local/history", liveUrl: "/api/hardware/machines/local/live", to: "/monitor/local" },
      { key: "node:agent-a", label: "AGENT-A", kind: "hub", url: "/api/hardware/machines/agent-a", historyUrl: "/api/hardware/machines/agent-a/history", liveUrl: "/api/hardware/machines/agent-a/live", to: "/monitor/agent-a" },
      { key: "node:alpha", label: "ALPHA", kind: "hub", url: "/api/hardware/machines/alpha", historyUrl: "/api/hardware/machines/alpha/history", liveUrl: "/api/hardware/machines/alpha/live", to: "/monitor/alpha" },
      { key: "node:pc-node", label: "PC-NODE", kind: "ssh", url: "/api/hardware/machines/pc-node", historyUrl: "/api/hardware/machines/pc-node/history", liveUrl: "/api/hardware/machines/pc-node/live", to: "/monitor/pc-node" },
    ]);
  });

  test("a node that is this machine has no tile beside this machine's own", () => {
    expect(monitorMachines([node("self-node", "ssh", true), node("pc-node", "ssh")]).map((machine) => machine.key)).toEqual(["local", "node:pc-node"]);
  });
});

describe("machineName", () => {
  const reading = { name: "local", label: "host-a", kind: "local", hardware: null, failure: null, readAt: 1, tracking: false, cpuLimit: null } satisfies MachineHardware;

  test("this machine goes by the host name its reading hands over, a node by its label in the list", () => {
    expect(machineName(wording, { label: null, kind: "local" }, reading, false)).toBe("host-a");
    expect(machineName(wording, { label: "ALPHA", kind: "hub" }, null, false)).toBe("ALPHA");
  });

  test("no name while the reading is out, the connection type where it could not be asked", () => {
    expect(machineName(wording, { label: null, kind: "local" }, null, false)).toBeNull();
    expect(machineName(wording, { label: null, kind: "local" }, null, true)).toBe(wording("hardware.label.kind_local"));
  });
});

describe("figures", () => {
  test("an unread figure says so rather than nought", () => {
    expect([percentText(wording, null), mhzText(wording, null), celsiusText(wording, null), wattsText(wording, null), wattsText(wording, "denied"), loadText(wording, null), uptimeText(wording, null), fillText(wording, null, 1), driveSizeText(wording, null), rpmText(wording, null)]).toEqual(Array(10).fill(wording("hardware.label.unread")));
  });

  test("a read figure carries its unit and its thousands mark", () => {
    expect(percentText(wording, 0.456)).toBe("46%");
    expect(mhzText(wording, 4229.4)).toBe("4,229 MHz");
    expect(celsiusText(wording, 62.375)).toBe("62.4 °C");
    expect(wattsText(wording, 18.75)).toBe("18.8 W");
    expect(capacityText(49_276_868)).toBe("47.0 GB");
    expect(gigabytesValue(12.34)).toBe("12.3 GB");
    expect(loadText(wording, [1.678, 1.66, 1.4])).toBe("1.68 · 1.66 · 1.40");
    expect(uptimeText(wording, 117_358)).toBe(wording("common.label.days_hours", { d: "1", h: "8" }));
    expect(uptimeText(wording, 3_700)).toBe(wording("common.label.hours_minutes", { h: "1", m: "1" }));
    expect(capacityText(1_953_512_444)).toBe("1.8 TB");
    expect(fillText(wording, 1_009_933_836, 1_953_512_444)).toBe("963.1 GB / 1.8 TB");
    expect(fillText(wording, 12_897_484, 33_554_432)).toBe("12.3 / 32.0 GB");
    expect(vramText(wording, 2_048, 24_576)).toBe("2.0 / 24.0 GB");
    // A fill reads widest full, or, where its whole is in TB, just short of a terabyte in GB.
    expect(fillWidest(wording, 33_554_432)).toBe("32.0 / 32.0 GB");
    expect(fillWidest(wording, 1_953_512_444)).toBe("1,024.0 GB / 1.8 TB");
    expect(vramWidest(wording, 24_576)).toBe("24.0 / 24.0 GB");
    expect(fillWidest(wording, null)).toBe("");
    expect(againstText(wording, 45.25, 200, wattsFigure, "W")).toBe("45.3 / 200.0 W");
    expect(againstText(wording, 1_800, null, mhzFigure, "MHz")).toBe("1,800 MHz");
    expect(againstText(wording, null, 200, wattsFigure, "W")).toBe(wording("hardware.label.unread"));
    expect(driveSizeText(wording, 8_001_563_221_504)).toBe("8 TB");
    expect(driveSizeText(wording, 256_060_514_304)).toBe("256 GB");
    expect(rpmText(wording, 1_339)).toBe("1,339 RPM");
    expect(storageKindWord(wording, "virtual")).toBe(wording("hardware.label.storage_virtual"));
  });

  test("a GPU's short name drops the maker's and the brand's words before its model", () => {
    expect(gpuShortName("NVIDIA GeForce RTX 3070")).toBe("RTX 3070");
    expect(gpuShortName("NVIDIA GeForce GTX 1080 Ti")).toBe("GTX 1080 Ti");
    expect(gpuShortName("NVIDIA RTX A4000")).toBe("RTX A4000");
    expect(gpuShortName("AMD Radeon RX 6800 XT")).toBe("RX 6800 XT");
    expect(gpuShortName("Intel(R) UHD Graphics 630")).toBe("UHD Graphics 630");
    expect(gpuShortName("Tesla T4")).toBe("Tesla T4");
  });

  test("a name with no model number keeps its brand, so it never shrinks to a bare word", () => {
    expect(gpuShortName("AMD Radeon Graphics")).toBe("AMD Radeon Graphics");
  });
});

// A temperature is held against its part's own limit and a fill against where running short starts;
// a use has no steps at all (docs/hardware.md, 「Colours」). What a tooltip says is checked by the key
// and the figures handed to it.
describe("colour steps", () => {
  const said = ((key: string, values?: Record<string, unknown>) => [key, ...Object.entries(values ?? {}).map(([name, value]) => `${name}=${String(value)}`)].join(" ")) as typeof wording;

  test("a temperature is green below five degrees under its limit, orange near it, red at it or while slowed", () => {
    expect([80, 89.9, 90, 94.9, 95, 101].map((celsius) => temperatureHeat(celsius, 95))).toEqual(["cool", "cool", "warm", "warm", "hot", "hot"]);
    expect(temperatureHeat(60, 95, true)).toBe("hot");
    expect(temperatureHeat(88, null)).toBeNull();
    expect(temperatureHeat(88, null, true)).toBe("hot");
    expect(temperatureHeat(null, 95, true)).toBeNull();
    // A reading an older recorder made carries no limit at all.
    expect(temperatureHeat(88, undefined, undefined)).toBeNull();
  });

  test("a fill steps where running short starts to matter", () => {
    expect([0.5, 0.8, 0.9, 0.97, null].map(fillHeat)).toEqual(["cool", "mild", "warm", "hot", null]);
  });

  test("a machine's CPU limit set stands over its chip's, and either is said with where it came from", () => {
    const view = hardwareView({ limitCelsius: 100 });
    const reading = (cpuLimit: number | null, hardware: HardwareView | null = view): MachineHardware => ({ name: "local", label: "host-a", kind: "local", hardware, failure: null, readAt: 1, tracking: true, cpuLimit });

    expect(cpuLimitOf(reading(95))).toEqual({ celsius: 95, source: "set" });
    expect(cpuLimitOf(reading(null))).toEqual({ celsius: 100, source: "chip" });
    expect(cpuLimitOf(reading(null, null))).toBeNull();
    expect(temperatureCriteria(said, { celsius: 95, source: "set" })).toBe("hardware.label.criteria_temperature limit=95.0 °C source=hardware.label.limit_source_set near=90.0 °C");
    expect(temperatureCriteria(said, { celsius: 93, source: "driver" }, true)).toBe("hardware.label.criteria_temperature_slowdown limit=93.0 °C source=hardware.label.limit_source_driver near=88.0 °C");
    expect(temperatureCriteria(said, null)).toBe("hardware.label.criteria_temperature_unknown");
    expect(fillCriteria(said)).toBe("hardware.label.criteria_fill mild=70% warm=85% hot=95%");
  });

  test("a span is asked again as often as a point is wide, once a minute at most", () => {
    expect([spanPollMs("5m"), spanPollMs("15m"), spanPollMs("1h"), spanPollMs("30d")]).toEqual([5_000, 15_000, 60_000, 60_000]);
  });
});

describe("keepLive", () => {
  const view = hardwareView({ usage: 0.5, celsius: 60, watts: null, mhz: null }, { usedKb: 1024 * 1024 });
  const answer = (readAt: number, hardware: HardwareView | null = view): MachineHardware => ({ name: "local", label: "host-a", kind: "local", hardware, failure: hardware === null ? "refused" : null, readAt, tracking: true, cpuLimit: null });

  test("keeps each reading once under the record's names, lets the window's tail go, and moves on through a failure", () => {
    const kept = liveKeeping({ url: "/api/hardware/live/test-keep", metrics: [] });

    keepLive(kept, answer(1_000), 1_000);
    keepLive(kept, answer(1_000), 1_002);
    expect(kept.points.value).toEqual([{ at: 1_000, sample: { "cpu|use": 50, "cpu|temp": 60, "memory|gb": 1 } }]);

    keepLive(kept, answer(1_003, null), 1_003);
    expect(kept.points.value).toHaveLength(1);
    expect(kept.now.value).toBe(1_003);

    keepLive(kept, answer(1_001 + LIVE_CHART_SECONDS), 1_001 + LIVE_CHART_SECONDS);
    expect(kept.points.value.map((one) => one.at)).toEqual([1_001 + LIVE_CHART_SECONDS]);
  });

  test("a screen keeps into the place of what it asked for, so a tile and a monitor each keep their own", () => {
    const monitor = { url: "/api/hardware/machines/alpha/live", metrics: [] };

    expect(liveKeeping(monitor)).toBe(liveKeeping({ ...monitor }));
    expect(liveKeeping(monitor)).not.toBe(liveKeeping({ ...monitor, metrics: ["use", "temp"] }));
    expect(spanUrl("/api/hardware/machines/local/history", "7d")).toBe("/api/hardware/machines/local/history?span=7d");
  });

  test("the live record's columns become readings, each carrying only the figures it has", () => {
    expect(rangeLivePoints({ at: [10, 11], series: { "cpu|use": [5, 6], "cpu|temp": [null, 40] } })).toEqual([
      { at: 10, sample: { "cpu|use": 5 } },
      { at: 11, sample: { "cpu|use": 6, "cpu|temp": 40 } },
    ]);
  });
});
