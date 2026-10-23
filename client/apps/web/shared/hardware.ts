// A machine's hardware as the monitor screen reads it (docs/web.md, 「Monitor screen」): the shapes bmo-node's
// `GET /machines` answers each machine's reading in (its `docs/hardware.md`), and what the screen's charts call
// the recorded and live figures and which spans they may ask for. The node service reads the machines; the console
// reads the service and keeps no copy of either.

export interface SensorView {
  chip: string;
  // The device the chip belongs to — `nvme0`, `0000:00:18.3` — where the kernel names one.
  device: string | null;
  label: string;
  celsius: number;
  // The critical temperature the chip names for this input, or the highest where it names no critical one.
  limitCelsius: number | null;
}

export interface FanView {
  chip: string;
  label: string;
  rpm: number;
}

export interface CoreView {
  label: string;
  // Share busy across the core's threads, 0 to 1.
  usage: number | null;
  mhz: number | null;
  celsius: number | null;
  threads: { cpu: number; usage: number | null }[];
}

// A group of cores around their shared cache: one column of cores to its left, the cache, and one to its right.
export interface ClusterView {
  kind: "cluster";
  label: string;
  cache: string;
  left: CoreView[];
  right: CoreView[];
}

// A part of a die that is not a core: an interconnect strip, a system agent, a GPU switched off.
export interface PartView {
  kind: "part";
  label: string;
  off: boolean;
}

export interface DieView {
  label: string;
  role: "compute" | "io";
  celsius: number | null;
  // Which way its items stand: one above the other, or side by side.
  direction: "column" | "row";
  items: (ClusterView | PartView)[];
}

export interface ChipView {
  label: string;
  celsius: number | null;
  // The package's rows of dies, top to bottom; a null is a place on the package with no die in it.
  rows: (DieView | null)[][];
}

export interface CpuView {
  model: string | null;
  threadCount: number;
  usage: number | null;
  celsius: number | null;
  limitCelsius: number | null;
  mhz: number | null;
  peakMhz: number | null;
  watts: number | "denied" | null;
  chip: ChipView | null;
  sensors: SensorView[];
}

export interface MemoryView {
  usedKb: number | null;
  totalKb: number | null;
  share: number | null;
  swapUsedKb: number | null;
  swapTotalKb: number | null;
  swapShare: number | null;
}

export interface GpuView {
  index: number;
  name: string;
  usage: number | null;
  celsius: number | null;
  limitCelsius: number | null;
  throttling: boolean | null;
  mhz: number | null;
  maxMhz: number | null;
  memoryMhz: number | null;
  watts: number | null;
  wattLimit: number | null;
  wattShare: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  memoryShare: number | null;
  fanPercent: number | null;
}

export type StorageKind = "nvme" | "ssd" | "hdd" | "usb" | "virtual" | "network";

export interface VolumeView {
  mount: string;
  fsType: string | null;
  usedKb: number;
  totalKb: number;
  availableKb: number;
  share: number;
}

export interface StorageView {
  key: string;
  name: string;
  kind: StorageKind | null;
  sizeBytes: number | null;
  celsius: number | null;
  limitCelsius: number | null;
  volumes: VolumeView[];
  usedKb: number | null;
  totalKb: number | null;
  share: number | null;
}

export interface BoardView {
  sensors: SensorView[];
  fans: FanView[];
}

export interface ServicesView {
  running: number | null;
  failed: string[] | null;
}

export interface HardwareView {
  host: string | null;
  kernel: string | null;
  os: string | null;
  hostOs: string | null;
  wsl: boolean;
  sensorLibrary: "ok" | "missing" | "failed" | null;
  uptimeSeconds: number | null;
  load: [number, number, number] | null;
  cpu: CpuView;
  memory: MemoryView;
  gpus: GpuView[];
  storage: StorageView[];
  board: BoardView;
  services: ServicesView;
}

// One machine as a screen reads it: its reading where it was read, what was met where it could not be, and its
// live tracking and CPU limit.
export interface MachineHardware {
  // `local` for this machine, the node's own name otherwise.
  name: string;
  label: string;
  kind: "local" | "ssh" | "hub";
  hardware: HardwareView | null;
  failure: string | null;
  // Seconds since the epoch the reading or the failure came.
  readAt: number;
  tracking: boolean;
  // The CPU limit set for this machine, which stands over the one its chip names; null where none is set.
  cpuLimit: number | null;
}

// One node of the node service's list as the monitor reads it: its name, its label, how it is reached and whether
// it is this machine, which then stands as this machine's tile alone.
export interface MonitorNode {
  name: string;
  label: string;
  kind: "ssh" | "hub";
  thisMachine: boolean;
}

// A machine's live tracking or CPU limit as the node service left it once it was changed.
export interface HardwareTrackingChanged {
  machine: string;
  on: boolean;
}

export interface HardwareCpuLimitChanged {
  machine: string;
  celsius: number | null;
}

// What a series measures, and so the unit it is drawn in: a use as a share out of a hundred, the rest in their
// physical units.
export type HistoryMetric = "use" | "temp" | "watts" | "mhz" | "gb" | "rpm";

// A series' name: the piece of hardware and what it measures, `|` between them.
export function seriesKey(device: string, metric: HistoryMetric): string {
  return `${device}|${metric}`;
}

function percent(share: number | null): number | null {
  return share === null ? null : share * 100;
}

// Kilobytes and megabytes as the binary gigabytes the monitor writes them in.
function gbOfKb(kb: number | null): number | null {
  return kb === null ? null : kb / 1024 / 1024;
}

function gbOfMb(mb: number | null): number | null {
  return mb === null ? null : mb / 1024;
}

// One reading's figures under their series names, to a tenth; a store to a hundredth of a gigabyte. What was not
// read is left out rather than kept as nought.
export function historySample(view: HardwareView): Record<string, number> {
  const sample: Record<string, number> = {};
  const put = (device: string, metric: HistoryMetric, value: number | "denied" | null): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;

    const places = metric === "gb" ? 100 : 10;

    sample[seriesKey(device, metric)] = Math.round(value * places) / places;
  };

  put("cpu", "use", percent(view.cpu.usage));
  put("cpu", "temp", view.cpu.celsius);
  put("cpu", "watts", view.cpu.watts);
  put("cpu", "mhz", view.cpu.mhz);
  put("memory", "gb", gbOfKb(view.memory.usedKb));

  for (const gpu of view.gpus) {
    put(`gpu${gpu.index}`, "use", percent(gpu.usage));
    put(`gpu${gpu.index}`, "temp", gpu.celsius);
    put(`gpu${gpu.index}`, "watts", gpu.watts);
    put(`gpu${gpu.index}`, "mhz", gpu.mhz);
    put(`gpu${gpu.index}:vram`, "gb", gbOfMb(gpu.memoryUsedMb));
  }

  for (const device of view.storage) {
    put(`storage:${device.key}`, "gb", gbOfKb(device.usedKb));
    put(`storage:${device.key}`, "temp", device.celsius);
  }

  for (const fan of view.board.fans) put(`fan:${fan.chip}:${fan.label}`, "rpm", fan.rpm);

  return sample;
}

// The live pace: the one period every live reading and every screen's asking is paced by, how far back the live
// record reaches, how wide every live chart is, and how far apart two readings may stand before the line between
// them breaks (bmo-node's `docs/hardware.md`, 「Live」).
export const LIVE_PERIOD_MS = 1_000;
export const LIVE_KEEP_SECONDS = 15 * 60;
export const LIVE_CHART_SECONDS = 60;
export const LIVE_GAP_SECONDS = (5 * LIVE_PERIOD_MS) / 1_000;

// The live record's readings of one machine: when each was taken, and each figure's value at each of those
// instants, null where that reading did not carry it.
export interface LiveRange {
  at: number[];
  series: Record<string, (number | null)[]>;
}

// Whether a figure measures one of the given things; what a screen that draws only some of them asks for.
export function measures(key: string, metrics: readonly string[]): boolean {
  const metric = key.slice(key.lastIndexOf("|") + 1);

  return metrics.includes(metric);
}

// The spans a screen may ask for, shortest first, each with the width of one of its points: some sixty or more
// points to a span. Each width is one the node service reads its record in.
export const HISTORY_SPANS = {
  "5m": { seconds: 5 * 60, pointSeconds: 5 },
  "15m": { seconds: 15 * 60, pointSeconds: 15 },
  "1h": { seconds: 3_600, pointSeconds: 60 },
  "6h": { seconds: 6 * 3_600, pointSeconds: 5 * 60 },
  "24h": { seconds: 86_400, pointSeconds: 5 * 60 },
  "7d": { seconds: 7 * 86_400, pointSeconds: 30 * 60 },
  "30d": { seconds: 30 * 86_400, pointSeconds: 2 * 3_600 }
} as const;

export type HistorySpan = keyof typeof HISTORY_SPANS;

// The span a card opens on.
export const HISTORY_FIRST_SPAN: HistorySpan = "1h";

export const HISTORY_SPAN_NAMES = Object.keys(HISTORY_SPANS) as HistorySpan[];

export function isHistorySpan(value: unknown): value is HistorySpan {
  return typeof value === "string" && Object.hasOwn(HISTORY_SPANS, value);
}

// One series across a span: each point's lowest, highest and mean, null where nothing was recorded.
export interface HistoryBand {
  min: (number | null)[];
  max: (number | null)[];
  mean: (number | null)[];
}

export interface HistoryRange {
  // The start of each point's stretch, seconds since the epoch, and the width of one.
  at: number[];
  pointSeconds: number;
  series: Record<string, HistoryBand>;
}
