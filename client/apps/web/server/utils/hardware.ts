import { HISTORY_SPANS, LIVE_KEEP_SECONDS, measures, seriesKey } from "#shared/hardware";
import { wording } from "#shared/wording";

import { unitFetch } from "./units";

import type { HistoryBand, HistoryMetric, HistoryRange, HistorySpan, LiveRange, MachineHardware, MonitorNode } from "#shared/hardware";

// The machines and their hardware as the monitor screen reads them (docs/web.md, 「Monitor screen」), from the node
// service at the address `NODE_ADDRESS` names (its `docs/api.md`, 「Nodes」 and 「Machines」): the node list, a
// machine with its latest reading, its tracking and CPU limit, and its recorded readings, a span of stretches at
// a time. The console reads them and keeps no copy; what it does is put each answer in the shape the screen draws.

const UNIT = "NODE";

// The node service's refusals the screen says in its own words.
const NODE_CODES: Readonly<Record<string, string>> = {
  "not-found": "hardware.error.no_machine",
  "bad-field": "hardware.error.cpu_limit_range"
};

interface Page<T> {
  items?: T[];
  more?: boolean;
}

interface NodeAnswer {
  name: string;
  label: string;
  kind: MonitorNode["kind"];
  thisMachine?: boolean;
  state?: string;
}

interface MachineAnswer {
  name: string;
  label: string;
  kind: MachineHardware["kind"];
  tracking: boolean;
  cpuLimit?: number | null;
  readAt?: number | null;
  hardware?: MachineHardware["hardware"];
  failure?: string | null;
}

interface Band {
  min: number;
  max: number;
  mean: number;
}

interface Reading {
  at: number;
  cpu?: { usePct?: Band; celsius?: Band; watts?: Band; mhz?: Band };
  memory?: { usedGb?: Band };
  gpus?: { index: number; usePct?: Band; celsius?: Band; watts?: Band; mhz?: Band; vramUsedGb?: Band }[];
  storage?: { key: string; usedGb?: Band; celsius?: Band }[];
  fans?: { chip: string; label: string; rpm?: Band }[];
}

function path(name: string): string {
  return `/machines/${encodeURIComponent(name)}`;
}

/** The node list, in its order, as far as the monitor reads it. */
export async function listNodes(): Promise<MonitorNode[]> {
  const nodes: MonitorNode[] = [];
  let after: string | null = null;

  for (;;) {
    const query: string = after === null ? "" : `?after=${encodeURIComponent(after)}`;
    const page: Page<NodeAnswer> = await unitFetch<Page<NodeAnswer>>(UNIT, `/nodes${query}`);
    const items = page.items ?? [];

    nodes.push(...items.map((node) => ({ name: node.name, label: node.label, kind: node.kind, thisMachine: node.thisMachine === true, connected: node.state === "connected" })));

    if (page.more !== true || items.length === 0) return nodes;

    after = items.at(-1)!.name;
  }
}

/** A node taken off the list; with `leave`, a hub node's agent is first sent a leave through its hub, so it uninstalls
 * itself and departs rather than coming back on the next pass (the node service's `docs/nodes.md`). */
export async function removeNode(name: string, leave: boolean): Promise<void> {
  await unitFetch<null>(UNIT, `/nodes/${encodeURIComponent(name)}${leave ? "?leave=true" : ""}`, { method: "DELETE" }, {
    passStatus: [409],
    codes: { conflict: "hardware.error.node_leave_refused" }
  });
}

function machineOf(answer: MachineAnswer, now: number = Date.now()): MachineHardware {
  return {
    name: answer.name,
    label: answer.label,
    kind: answer.kind,
    hardware: answer.hardware ?? null,
    failure: answer.failure ?? null,
    readAt: Math.floor((answer.readAt ?? now) / 1000),
    tracking: answer.tracking,
    cpuLimit: answer.cpuLimit ?? null
  };
}

/** One machine with its latest reading, read live where the recorder holds nothing fresh of it. */
export async function machineHardware(name: string): Promise<MachineHardware> {
  return machineOf(await unitFetch<MachineAnswer>(UNIT, path(name), undefined, { codes: NODE_CODES }));
}

/** Every machine's latest recorded reading, in the node service's order, read in one call and probing none. */
export async function machineReadings(): Promise<MachineHardware[]> {
  const page = await unitFetch<Page<MachineAnswer>>(UNIT, "/machines");

  return (page.items ?? []).map((answer) => machineOf(answer));
}

/** A machine's live tracking or CPU limit changed, as the service now holds it. */
export async function changeMachine(name: string, change: { tracking?: boolean; cpuLimit?: number | null }): Promise<MachineHardware> {
  return machineOf(
    await unitFetch<MachineAnswer>(
      UNIT,
      path(name),
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change) },
      { codes: NODE_CODES, carryReason: [422] }
    )
  );
}

// Each figure of one reading under the series name the screen draws it by.
function bandsOf(reading: Reading): [string, Band][] {
  const found: [string, Band][] = [];
  const put = (device: string, metric: HistoryMetric, band: Band | undefined): void => {
    if (band !== undefined) found.push([seriesKey(device, metric), band]);
  };

  put("cpu", "use", reading.cpu?.usePct);
  put("cpu", "temp", reading.cpu?.celsius);
  put("cpu", "watts", reading.cpu?.watts);
  put("cpu", "mhz", reading.cpu?.mhz);
  put("memory", "gb", reading.memory?.usedGb);

  for (const gpu of reading.gpus ?? []) {
    put(`gpu${gpu.index}`, "use", gpu.usePct);
    put(`gpu${gpu.index}`, "temp", gpu.celsius);
    put(`gpu${gpu.index}`, "watts", gpu.watts);
    put(`gpu${gpu.index}`, "mhz", gpu.mhz);
    put(`gpu${gpu.index}:vram`, "gb", gpu.vramUsedGb);
  }

  for (const device of reading.storage ?? []) {
    put(`storage:${device.key}`, "gb", device.usedGb);
    put(`storage:${device.key}`, "temp", device.celsius);
  }

  for (const fan of reading.fans ?? []) put(`fan:${fan.chip}:${fan.label}`, "rpm", fan.rpm);

  return found;
}

async function readings(name: string, spanMs: number, afterMs: number, limit: number): Promise<Reading[]> {
  const query = new URLSearchParams({ spanMs: String(spanMs), after: String(afterMs), limit: String(limit) });
  const page = await unitFetch<Page<Reading>>(UNIT, `${path(name)}/readings?${query}`, undefined, { codes: NODE_CODES });

  return page.items ?? [];
}

/** A machine's live readings since an instant, in seconds, no further back than the live record reaches, and only
 * the figures measuring what `metrics` lists where it lists any. */
export async function machineLive(name: string, since: number | null, metrics: readonly string[], now: number = Date.now()): Promise<LiveRange> {
  const reach = Math.floor(now / 1000) - LIVE_KEEP_SECONDS;
  const from = since === null ? reach : Math.max(reach, Math.floor(since));
  const read = await readings(name, 1_000, from * 1000, LIVE_KEEP_SECONDS + 1);
  const at = read.map((reading) => Math.floor(reading.at / 1000));
  const series: Record<string, (number | null)[]> = {};

  read.forEach((reading, index) => {
    for (const [key, band] of bandsOf(reading)) {
      if (metrics.length > 0 && !measures(key, metrics)) continue;

      (series[key] ??= Array.from({ length: read.length }, () => null))[index] = band.mean;
    }
  });

  return { at, series };
}

/** One span of a machine's record, ending now, gathered into the span's points. */
export async function machineHistory(name: string, span: HistorySpan, now: number = Date.now()): Promise<HistoryRange> {
  const { seconds, pointSeconds } = HISTORY_SPANS[span];
  const end = Math.floor(now / 1000);
  const start = Math.floor((end - seconds) / pointSeconds) * pointSeconds;
  const at: number[] = [];

  for (let one = start; one < end; one += pointSeconds) at.push(one);

  const read = await readings(name, pointSeconds * 1000, start * 1000 - 1, at.length + 1);
  const series: Record<string, HistoryBand> = {};

  for (const reading of read) {
    const index = Math.floor((Math.floor(reading.at / 1000) - start) / pointSeconds);

    if (index < 0 || index >= at.length) continue;

    for (const [key, band] of bandsOf(reading)) {
      const kept = (series[key] ??= { min: at.map(() => null), max: at.map(() => null), mean: at.map(() => null) });

      kept.min[index] = band.min;
      kept.max[index] = band.max;
      kept.mean[index] = band.mean;
    }
  }

  return { at, pointSeconds, series };
}

/** The machine a road names, refused where it names none. */
export function machineNamed(raw: string | undefined): string {
  const name = raw ?? "";

  if (name === "") throw fail(400, wording("hardware.error.no_machine"));

  return name;
}
