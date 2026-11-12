import { stripVTControlCharacters } from "node:util";

import { matchFields, searchPhrase } from "bmo-ui/shared/search";

import { maskCredentials } from "./credential-mask";

import { MONITOR_LOGS_PAGE, SERVICE_CATEGORY } from "#shared/monitor-logs";

import type { LogCategory, LogFilter, LogLevel, LogLine, LogPage, LogSources } from "#shared/monitor-logs";

// The monitor's logs tab (docs/web.md, 「Monitor's logs tab」): the lines the machine's background units wrote to the
// user journal, and the lines the user manager wrote about them, read with `journalctl --user` on the machine the
// console runs on. A unit's category is the slice it runs in, which systemd writes into every line its processes
// write; the console names no unit.

/** Runs a command and answers what it printed, or null where it could not be run or ended with a failure. */
export type LogCommandRun = (command: string, args: string[]) => Promise<string | null>;

export const runLogCommand: LogCommandRun = async (command, args) => {
  try {
    const child = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const [printed, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);

    return code === 0 ? printed : null;
  } catch {
    return null;
  }
};

/** The prefix of the units the tab reads and of the slices naming their categories, as the setting names it. */
export function logUnitPrefix(environment: Record<string, string | undefined> = process.env): string {
  const set = environment.LOG_UNIT_PREFIX?.trim() ?? "";

  return set === "" ? "bmo-" : set;
}

// The user manager's own unit: a line it writes about a unit names that unit in `USER_UNIT`.
const MANAGER_UNIT = "init.scope";
const SLICE_SUFFIX = ".slice";

/** The category a slice names: the key between the prefix and `.slice`, or the servers' category for any other. */
export function logCategoryOfSlice(slice: string | null, prefix: string): string {
  if (slice === null || !slice.startsWith(prefix) || !slice.endsWith(SLICE_SUFFIX)) return SERVICE_CATEGORY;

  const key = slice.slice(prefix.length, -SLICE_SUFFIX.length);

  return key === "" ? SERVICE_CATEGORY : key;
}

/** The slice a category's units run in; the servers' category has none of its own. */
export function logSliceOfCategory(category: string, prefix: string): string | null {
  return category === SERVICE_CATEGORY ? null : `${prefix}${category}${SLICE_SUFFIX}`;
}

/** The level of a journal priority: 0 to 3 an error, 4 a warning, the rest, and a line with none, other. */
export function logLevelOf(priority: unknown): LogLevel {
  const value = Number(priority);

  if (!Number.isInteger(value)) return "other";
  if (value <= 3) return "error";

  return value === 4 ? "warning" : "other";
}

const PRIORITY_RANGE: Record<LogLevel, string> = { error: "0..3", warning: "4..4", other: "5..7" };

/** One entry of `journalctl -o json`, with the fields the tab reads. */
interface JournalEntry {
  cursor: string;
  at: number;
  ownUnit: string | null;
  managerUnit: string | null;
  slice: string | null;
  priority: unknown;
  message: string;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// journald keeps a message that is not plain text as an array of its bytes; a terminal's colours are such text.
function messageOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((byte) => typeof byte === "number")) {
    return new TextDecoder().decode(Uint8Array.from(value as number[]));
  }

  return null;
}

/** The entries of journalctl's JSON output, one object a line; a line that is not one is passed over. */
export function logJournalEntries(printed: string): JournalEntry[] {
  return printed.split("\n").flatMap((line) => {
    if (line.trim() === "") return [];

    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const cursor = text(entry.__CURSOR);
      const micros = Number(entry.__REALTIME_TIMESTAMP);
      const message = messageOf(entry.MESSAGE);
      const ownUnit = text(entry._SYSTEMD_USER_UNIT);

      if (cursor === null || !Number.isFinite(micros) || message === null) return [];

      return [{
        cursor,
        at: Math.floor(micros / 1000),
        ownUnit,
        managerUnit: ownUnit === MANAGER_UNIT ? text(entry.USER_UNIT) : null,
        slice: text(entry._SYSTEMD_USER_SLICE),
        priority: entry.PRIORITY,
        message
      }];
    } catch {
      return [];
    }
  });
}

// How long a unit's slice, once read, is taken as known; a deployment may move a unit into another slice.
const SLICE_KEPT_MS = 10 * 60_000;
// How many units' slices are kept before the book starts afresh.
const SLICES_KEPT = 4_096;

/**
 * The slice each unit runs in, for the lines the manager writes about a unit, which carry the manager's own slice.
 * A unit's slice is read from the slice its own newest line carries and, for a unit that wrote none, from what systemd
 * says; a timer stands in the slice of the unit it starts. What is read is kept a while.
 */
export class SliceBook {
  private readonly known = new Map<string, { slice: string | null; at: number }>();

  constructor(
    private readonly run: LogCommandRun,
    private readonly now: () => number = Date.now
  ) {}

  async sliceOf(unit: string): Promise<string | null> {
    const kept = this.known.get(unit);

    if (kept !== undefined && this.now() - kept.at < SLICE_KEPT_MS) return kept.slice;

    const slice = await this.read(unit);

    if (this.known.size >= SLICES_KEPT) this.known.clear();
    this.known.set(unit, { slice, at: this.now() });

    return slice;
  }

  private async read(unit: string): Promise<string | null> {
    const started = unit.endsWith(".timer") ? (await this.property(unit, "Unit")) ?? unit : unit;
    const printed = await this.run("journalctl", ["--user", "-o", "json", "--no-pager", "-n", "1", "--output-fields=_SYSTEMD_USER_SLICE", `_SYSTEMD_USER_UNIT=${started}`]);
    const [entry] = printed === null ? [] : printed.split("\n").filter((line) => line.trim() !== "");

    if (entry !== undefined) {
      try {
        const slice = text((JSON.parse(entry) as Record<string, unknown>)._SYSTEMD_USER_SLICE);

        if (slice !== null) return slice;
      } catch {
        // A line that does not read leaves the unit to systemd's own answer below.
      }
    }

    return this.property(started, "Slice");
  }

  private async property(unit: string, name: string): Promise<string | null> {
    const printed = await this.run("systemctl", ["--user", "show", "-p", name, "--value", unit]);
    const value = printed?.trim() ?? "";

    return value === "" ? null : value;
  }
}

/** Everything a read needs beyond the filter: how commands are run, the prefix, the masking word and the slices. */
export interface LogReading {
  run: LogCommandRun;
  prefix: string;
  masked: string;
  slices: SliceBook;
}

/** The entry as the screen shows it, or null for a line no unit under the prefix wrote or was written about. */
async function lineOf(entry: JournalEntry, reading: LogReading): Promise<LogLine | null> {
  const unit = entry.managerUnit ?? entry.ownUnit;

  if (unit === null || !unit.startsWith(reading.prefix)) return null;

  const slice = entry.managerUnit === null ? entry.slice : await reading.slices.sliceOf(unit);

  return {
    id: entry.cursor,
    at: entry.at,
    unit,
    category: logCategoryOfSlice(slice, reading.prefix),
    level: logLevelOf(entry.priority),
    text: maskCredentials(stripVTControlCharacters(entry.message), reading.masked)
  };
}

/** Whether a line passes the filter: its category and unit, its level, and the search over the words it shows. */
export function logLinePasses(line: LogLine, filter: LogFilter): boolean {
  if (filter.category !== null && line.category !== filter.category) return false;
  if (filter.unit !== null && line.unit !== filter.unit) return false;
  if (filter.level !== null && line.level !== filter.level) return false;
  if (searchPhrase(filter.query) === "") return true;

  return matchFields([{ label: "unit", text: line.unit, shown: true }, { label: "text", text: line.text, shown: true }], filter.query) !== null;
}

/**
 * What journalctl is asked to narrow to before the console reads a line: a unit's own lines and the manager's about
 * it, or a category's slice and the manager's lines, and the level's priorities. The servers' category, and no
 * category, is read whole and narrowed by the console.
 */
export function logJournalMatches(filter: LogFilter, prefix: string): string[] {
  const level = filter.level === null ? [] : ["-p", PRIORITY_RANGE[filter.level]];

  if (filter.unit !== null) return [...level, `_SYSTEMD_USER_UNIT=${filter.unit}`, "+", `USER_UNIT=${filter.unit}`];

  const slice = filter.category === null ? null : logSliceOfCategory(filter.category, prefix);

  return slice === null ? level : [...level, `_SYSTEMD_USER_SLICE=${slice}`, "+", `_SYSTEMD_USER_UNIT=${MANAGER_UNIT}`];
}

// One ask reads the journal in stretches that grow, so a page of the whole log is one short read and a filter that
// keeps few lines reads further before it answers what it found.
const STRETCHES = [400, 1_600, 6_000];
// How many entries a read of new lines looks back through for the newest it was given.
const NEWER_STRETCH = 4_000;

/** The page of lines older than `before`, or the newest where it is null, newest first. */
export async function readOlderLogLines(filter: LogFilter, before: string | null, reading: LogReading, limit = MONITOR_LOGS_PAGE): Promise<LogPage> {
  const lines: LogLine[] = [];
  let from = before;
  let head: string | null = null;

  for (const stretch of STRETCHES) {
    const args = ["--user", "-o", "json", "--no-pager", "-r", "-n", String(stretch)];
    const printed = await reading.run("journalctl", [...args, ...(from === null ? [] : [`--after-cursor=${from}`]), ...logJournalMatches(filter, reading.prefix)]);
    const entries = printed === null ? [] : logJournalEntries(printed);

    if (before === null && head === null) head = entries[0]?.cursor ?? null;

    for (const entry of entries) {
      from = entry.cursor;

      const line = await lineOf(entry, reading);

      if (line !== null && logLinePasses(line, filter)) lines.push(line);
      if (lines.length >= limit) return { lines, next: entry.cursor, head, gap: false };
    }

    // Fewer entries than asked for: the journal's start was reached.
    if (entries.length < stretch) return { lines, next: null, head, gap: false };
  }

  return { lines, next: from, head, gap: false };
}

/**
 * The lines written after `head`, newest first, read back from the journal's end until `head` is met. Where it is
 * not met within one stretch, more was written than one ask reads: the lines read stand with `gap`, and the screen
 * starts again from them.
 */
export async function readNewerLogLines(filter: LogFilter, head: string, reading: LogReading, limit = MONITOR_LOGS_PAGE): Promise<LogPage> {
  const printed = await reading.run("journalctl", ["--user", "-o", "json", "--no-pager", "-r", "-n", String(NEWER_STRETCH), ...logJournalMatches(filter, reading.prefix)]);
  const entries = printed === null ? [] : logJournalEntries(printed);
  const lines: LogLine[] = [];
  let met = false;

  for (const entry of entries) {
    if (entry.cursor === head) {
      met = true;
      break;
    }

    const line = await lineOf(entry, reading);

    if (line !== null && logLinePasses(line, filter) && lines.length < limit) lines.push(line);
  }

  const newest = entries[0]?.cursor ?? head;

  return { lines, next: null, head: newest, gap: !met && entries.length > 0 };
}

interface UnitFile {
  unit_file: string;
}

interface LoadedUnit {
  unit: string;
}

function jsonList<T>(printed: string | null): T[] {
  if (printed === null) return [];

  try {
    const read: unknown = JSON.parse(printed);

    return Array.isArray(read) ? (read as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * What the filters offer: the servers' category with each of its units, then every category a slice the units'
 * repositories install or a running unit stands in names, by key.
 */
export async function readLogSources(reading: LogReading): Promise<LogSources> {
  const pattern = `${reading.prefix}*`;
  const [files, slices, units] = await Promise.all([
    reading.run("systemctl", ["--user", "list-unit-files", "--type=slice", "-o", "json", "--no-pager", pattern]),
    reading.run("systemctl", ["--user", "list-units", "--all", "--type=slice", "-o", "json", "--no-pager", pattern]),
    reading.run("systemctl", ["--user", "list-units", "--all", "--type=service", "-o", "json", "--no-pager", pattern])
  ]);
  const keys = new Set<string>();

  for (const name of [...jsonList<UnitFile>(files).map((one) => one.unit_file), ...jsonList<LoadedUnit>(slices).map((one) => one.unit)]) {
    const key = logCategoryOfSlice(name, reading.prefix);

    if (key !== SERVICE_CATEGORY) keys.add(key);
  }

  const services: string[] = [];

  for (const { unit } of jsonList<LoadedUnit>(units)) {
    if (typeof unit !== "string" || !unit.startsWith(reading.prefix)) continue;

    const key = logCategoryOfSlice(await reading.slices.sliceOf(unit), reading.prefix);

    if (key === SERVICE_CATEGORY) services.push(unit);
    else keys.add(key);
  }

  const categories: LogCategory[] = [
    { key: SERVICE_CATEGORY, units: services.sort() },
    ...[...keys].sort().map((key) => ({ key, units: [] }))
  ];

  return { categories };
}

let shared: SliceBook | null = null;

/** The reading the routes use: commands run on this machine, the prefix the setting names and the pack's word. */
export function logReading(masked: string): LogReading {
  shared ??= new SliceBook(runLogCommand);

  return { run: runLogCommand, prefix: logUnitPrefix(), masked, slices: shared };
}
