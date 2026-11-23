import { readFileSync } from "node:fs";

// The node service's machines as it answers them, captured from a running one (its `docs/api.md`, 「Machines」) with
// the names, hosts, disks and mounts made neutral and nothing else changed: `GET /machines`, this machine with its
// chip's tree and a hub node, and `GET /machines/{name}/readings`, two live readings of this machine. Its figures come
// as the service writes them, whole numbers as floats among them, so a console that reads them drifting from what the
// service sends fails here rather than on the monitor (docs/web.md, 「Monitor screen」).

const FIXTURES = new URL("../fixtures/server/", import.meta.url);

interface Page<T> {
  items: T[];
  more: boolean;
}

export interface CapturedMachine {
  name: string;
  readAt: number;
  [field: string]: unknown;
}

export interface CapturedReading {
  machineName: string;
  at: number;
  spanMs: number;
  [field: string]: unknown;
}

function captured<T>(file: string): Page<T> {
  return JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")) as Page<T>;
}

/** `GET /machines` as captured, every reading stamped `nowMs` as the recorder stamps its latest. */
export function capturedMachines(nowMs: number = Date.now()): Page<CapturedMachine> {
  const page = captured<CapturedMachine>("node-machines.json");

  return { ...page, items: page.items.map((machine) => ({ ...machine, readAt: Math.floor(nowMs / 1000) * 1000 })) };
}

/** `GET /machines/{name}/readings` as captured, its readings stamped a second apart from just after `afterMs` and
 * no later than `nowMs`, named for the machine asked. */
export function capturedReadings(name: string, afterMs: number, nowMs: number = Date.now()): Page<CapturedReading> {
  const page = captured<CapturedReading>("node-readings.json");
  const first = (Math.floor(afterMs / 1000) + 1) * 1000;
  const items = page.items
    .map((reading, place) => ({ ...reading, machineName: name, at: first + place * 1000 }))
    .filter((reading) => reading.at <= nowMs);

  return { items, more: false };
}
