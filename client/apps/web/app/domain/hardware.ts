import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from "vue";

import { HISTORY_SPAN_NAMES, HISTORY_SPANS, historySample, LIVE_CHART_SECONDS, LIVE_PERIOD_MS } from "#shared/hardware";

import { failureText } from "bmo-ui/app/domain/errors";
import { countText } from "./numbers";

import type { LivePoint } from "./hardware-chart";
import type { HistoryRange, HistorySpan, LiveRange, MachineHardware, MonitorNode, StorageKind } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { ComputedRef, InjectionKey, Ref, ShallowRef } from "vue";

// How the console reads and draws a machine's hardware (docs/web.md, 「Monitor screen」). What the
// figures are is the node service's; this decides how often a screen asks, how a figure reads and
// what colour it stands in.

export { HISTORY_FIRST_SPAN, LIVE_CHART_SECONDS, LIVE_GAP_SECONDS } from "#shared/hardware";

// This machine, as the node service names it, and the console's roads to one machine's reading, its record and its
// live record, and to every machine's recorded reading at once.
export const LOCAL_MACHINE = "local";
export const TRACKING_URL = "/api/hardware/tracking";
export const CPU_LIMIT_URL = "/api/hardware/cpu-limit";
export const MONITOR_READINGS_URL = "/api/hardware/machines";

// The monitor screen's tabs, kept in the address as `?tab=` (docs/web.md, 「Monitor screen」): every machine's
// hardware, the screen's own address, the card arbiter's board, the agency's role slots, and what the machine's
// background units wrote, which only the administrator reads.
export const MONITOR_TABS = [
  { value: "devices", label: "hardware.label.tab_devices", icon: "i-material-symbols-computer-outline" },
  { value: "services", label: "hardware.label.tab_services", icon: "i-material-symbols-memory-outline" },
  { value: "slots", label: "hardware.label.tab_slots", icon: "i-material-symbols-grid-view-outline" },
  { value: "logs", label: "hardware.label.tab_logs", icon: "i-material-symbols-receipt-long-outline" }
] as const;

/** The tab only the administrator reads. */
export const MONITOR_ADMINISTRATOR_TAB = "logs";

export type MonitorTab = (typeof MONITOR_TABS)[number]["value"];

export function isMonitorTab(value: unknown): value is MonitorTab {
  return MONITOR_TABS.some((tab) => tab.value === value);
}

export function machineHardwareUrl(name: string): string {
  return `/api/hardware/machines/${encodeURIComponent(name)}`;
}

export function machineHistoryUrl(name: string): string {
  return `${machineHardwareUrl(name)}/history`;
}

export function machineLiveUrl(name: string): string {
  return `${machineHardwareUrl(name)}/live`;
}

// Where a machine's own monitor stands.
export function machineMonitorPath(name: string): string {
  return `/monitor/${encodeURIComponent(name)}`;
}

// One tile of the overview: which machine, where its reading, its record and its live record are
// asked, where its monitor stands.
export interface MonitorMachine {
  key: string;
  // The name the node service calls it by, which every reading is keyed by.
  name: string;
  // A node's label in the list; null for this machine, whose name is the host name its reading
  // hands over.
  label: string | null;
  kind: MachineHardware["kind"];
  url: string;
  historyUrl: string;
  liveUrl: string;
  to: string;
}

// This machine first, then the nodes in the list's order; the list is the node service's and nothing else.
// A node that is this machine is this machine's tile, so it has none of its own.
export function monitorMachines(nodes: readonly MonitorNode[]): MonitorMachine[] {
  const tile = (key: string, name: string, label: string | null, kind: MachineHardware["kind"]): MonitorMachine => ({
    key, name, label, kind, url: machineHardwareUrl(name), historyUrl: machineHistoryUrl(name), liveUrl: machineLiveUrl(name), to: machineMonitorPath(name)
  });

  return [
    tile("local", LOCAL_MACHINE, null, "local"),
    ...nodes.filter((node) => !node.thisMachine).map((node) => tile(`node:${node.name}`, node.name, node.label, node.kind)),
  ];
}

const KIND_ICONS: Record<MachineHardware["kind"], string> = {
  local: "i-material-symbols-computer-outline",
  ssh: "i-material-symbols-terminal",
  hub: "i-material-symbols-hub-outline",
};

export function machineIcon(kind: MachineHardware["kind"]): string {
  return KIND_ICONS[kind];
}

// How a machine is reached, in the words a tile says it in: the connection type for a node.
const KIND_WORDS: Record<MachineHardware["kind"], string> = {
  local: "hardware.label.kind_local",
  ssh: "hardware.label.kind_ssh",
  hub: "hardware.label.kind_hub"
};

export function machineKindWord(t: Translate, kind: MachineHardware["kind"]): string {
  return t(KIND_WORDS[kind]);
}

// What a machine is called on a screen: the list's label where there is one, and otherwise the name
// its reading hands over — this machine's host name, read by the console's server as it runs. Null
// while that reading is still out; the connection type where it could not be asked at all.
export function machineName(t: Translate, machine: Pick<MonitorMachine, "label" | "kind">, reading: MachineHardware | null, failed: boolean): string | null {
  return machine.label ?? reading?.label ?? (failed ? machineKindWord(t, machine.kind) : null);
}

// The key of what a figure that could not be read stands as.
export const UNREAD = "hardware.label.unread";

// The four steps a coloured figure stands on — green, yellow, orange and red — worked out here from
// each figure and what it is held against (docs/web.md, 「Monitor screen」). Only a temperature and a
// fill have them; a use and a power say how busy a part is, which is no danger, and have none.
export type Heat = "cool" | "mild" | "warm" | "hot";

// How far under its part's limit a temperature turns orange.
const NEAR_LIMIT_CELSIUS = 5;

// Where a fill turns yellow, orange and red: where running short starts to matter.
const FILL_STEPS = [0.7, 0.85, 0.95] as const;

// A temperature held against its part's own limit: red at the limit or while the part says thermal
// slowdown holds it down, orange near it, green below; no step where the limit is not known. A reading
// a recorder made before limits were read carries none, and stands as one whose limit is not known.
export function temperatureHeat(celsius: number | null, limit: number | null | undefined, throttling: boolean | null | undefined = null): Heat | null {
  if (celsius === null) return null;
  if (throttling === true) return "hot";
  if (limit === null || limit === undefined) return null;

  return celsius >= limit ? "hot" : celsius >= limit - NEAR_LIMIT_CELSIUS ? "warm" : "cool";
}

export function fillHeat(share: number | null): Heat | null {
  if (share === null) return null;

  const [mild, warm, hot] = FILL_STEPS;

  return share < mild ? "cool" : share < warm ? "mild" : share < hot ? "warm" : "hot";
}

// A part's limit and where it came from: set for the machine, its chip's, or its driver's
// (bmo-node's docs/hardware.md, 「Temperature limits」).
export interface TemperatureLimit {
  celsius: number;
  source: "set" | "chip" | "driver";
}

export function limitOf(celsius: number | null | undefined, source: TemperatureLimit["source"]): TemperatureLimit | null {
  return celsius === null || celsius === undefined ? null : { celsius, source };
}

// A machine's CPU limit: the one set for it, which stands over the one its chip names.
export function cpuLimitOf(machine: MachineHardware | null): TemperatureLimit | null {
  return limitOf(machine?.cpuLimit ?? null, "set") ?? limitOf(machine?.hardware?.cpu.limitCelsius ?? null, "chip");
}

const LIMIT_SOURCES: Record<TemperatureLimit["source"], string> = {
  set: "hardware.label.limit_source_set",
  chip: "hardware.label.limit_source_chip",
  driver: "hardware.label.limit_source_driver",
};

// A temperature's steps as a tooltip on its name says them: its limit, where the limit came from,
// and the degrees each colour starts at; for a part that reports thermal slowdown, that too.
export function temperatureCriteria(t: Translate, limit: TemperatureLimit | null, slowdown = false): string {
  if (limit === null) return t(slowdown ? "hardware.label.criteria_temperature_slowdown_only" : "hardware.label.criteria_temperature_unknown");

  const near = celsiusText(t, limit.celsius - NEAR_LIMIT_CELSIUS);

  return t(slowdown ? "hardware.label.criteria_temperature_slowdown" : "hardware.label.criteria_temperature", { limit: celsiusText(t, limit.celsius), source: t(LIMIT_SOURCES[limit.source]), near });
}

export function fillCriteria(t: Translate): string {
  const [mild, warm, hot] = FILL_STEPS;

  return t("hardware.label.criteria_fill", { mild: percentText(t, mild), warm: percentText(t, warm), hot: percentText(t, hot) });
}

// Each step's colours, written out class and all since the stylesheet is built from the words in
// this file: a tint to fill a part with, a border, the figure's own colour, a darker step of it for
// a figure laid on the step's own fill, and a bar.
const HEATS: Record<Heat, { fill: string; border: string; text: string; onFill: string; bar: string }> = {
  cool: { fill: "bg-emerald-500/30 dark:bg-emerald-500/40", border: "border-emerald-500/50", text: "text-emerald-700 dark:text-emerald-400", onFill: "text-emerald-800 dark:text-emerald-200", bar: "bg-emerald-500" },
  mild: { fill: "bg-amber-400/40 dark:bg-amber-400/35", border: "border-amber-500/60", text: "text-amber-800 dark:text-amber-400", onFill: "text-amber-900 dark:text-amber-200", bar: "bg-amber-500" },
  warm: { fill: "bg-orange-500/35 dark:bg-orange-500/45", border: "border-orange-500/70", text: "text-orange-700 dark:text-orange-400", onFill: "text-orange-800 dark:text-orange-200", bar: "bg-orange-500" },
  hot: { fill: "bg-red-500/35 dark:bg-red-500/50", border: "border-red-500/80", text: "text-red-700 dark:text-red-400", onFill: "text-red-800 dark:text-red-200", bar: "bg-red-500" },
};

const UNKNOWN = { fill: "bg-elevated", border: "border-default", text: "text-muted", onFill: "text-muted", bar: "bg-(--ui-text-dimmed)" };

export function heatClasses(heat: Heat | null): (typeof HEATS)[Heat] {
  return heat === null ? UNKNOWN : HEATS[heat];
}

export function percentText(t: Translate, share: number | null): string {
  return share === null ? t(UNREAD) : `${Math.round(share * 100)}%`;
}

// A recorded use, which the record keeps as a figure out of a hundred rather than a share.
export function percentValue(value: number): string {
  return `${Math.round(value)}%`;
}

export function mhzText(t: Translate, mhz: number | null): string {
  return mhz === null ? t(UNREAD) : `${countText(Math.round(mhz))} MHz`;
}

export function celsiusText(t: Translate, celsius: number | null): string {
  return celsius === null ? t(UNREAD) : `${celsius.toFixed(1)} °C`;
}

/** A temperature in whole degrees, for a line that sums a piece up beside its use: 「34°C」. */
export function wholeCelsiusText(t: Translate, celsius: number | null): string {
  return celsius === null ? t(UNREAD) : `${Math.round(celsius)}°C`;
}

export function wattsText(t: Translate, watts: number | "denied" | null): string {
  return typeof watts === "number" ? `${wattsFigure(watts)} W` : t(UNREAD);
}

// A capacity in kilobytes, in the largest unit that keeps it at or above one — GB below a
// terabyte, TB past it — as its figure to one place and its unit.
function capacity(kb: number): { figure: string; unit: "GB" | "TB" } {
  const tb = kb / 1024 ** 3;
  const [value, unit] = tb >= 1 ? [tb, "TB" as const] : [kb / 1024 / 1024, "GB" as const];

  return { figure: value.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), unit };
}

export function capacityText(kb: number): string {
  const { figure, unit } = capacity(kb);

  return `${figure} ${unit}`;
}

// A recorded store, which the record keeps in gigabytes.
export function gigabytesValue(gb: number): string {
  return capacityText(gb * 1024 * 1024);
}

// Used against total, the way every store on the monitor says it: the unit once where both share it.
export function fillText(t: Translate, usedKb: number | null, totalKb: number | null): string {
  if (usedKb === null || totalKb === null) return t(UNREAD);

  const used = capacity(usedKb);
  const total = capacity(totalKb);

  return used.unit === total.unit ? `${used.figure} / ${total.figure} ${total.unit}` : `${used.figure} ${used.unit} / ${total.figure} ${total.unit}`;
}

// A GPU's memory, which the driver reports in megabytes, as a store like any other.
export function vramText(t: Translate, usedMb: number | null, totalMb: number | null): string {
  return fillText(t, usedMb === null ? null : usedMb * 1024, totalMb === null ? null : totalMb * 1024);
}

// The widest a fill of this whole reads, which its column is held to (docs/web.md, 「Monitor
// screen」). A use under a terabyte reads in GB, so a whole in TB reads widest just short of one.
export function fillWidest(t: Translate, totalKb: number | null): string {
  return totalKb === null ? "" : fillText(t, Math.min(totalKb, 1024 ** 3 - 1), totalKb);
}

export function vramWidest(t: Translate, totalMb: number | null): string {
  return fillWidest(t, totalMb === null ? null : totalMb * 1024);
}

// The hottest a part's temperature reads in its column, which the column is held to: past it a
// part has long since throttled.
export const CELSIUS_MOST = 100;

// The words a GPU's name opens with before its model: the maker's and the brand's.
const GPU_BRAND_WORDS = new Set(["nvidia", "geforce", "amd", "ati", "radeon", "intel"]);

// A GPU where room is short: its model alone, "NVIDIA GeForce RTX 3070" as "RTX 3070". A brand word
// goes only while a model number still stands after it, so a name with none keeps its brand.
export function gpuShortName(name: string): string {
  const words = name.replace(/\((?:R|TM)\)/gi, "").split(/\s+/).filter((word) => word !== "");
  let start = 0;

  while (GPU_BRAND_WORDS.has(words[start]?.toLowerCase() ?? "") && words.slice(start + 1).some((word) => /\d/.test(word))) start += 1;

  return words.slice(start).join(" ");
}

// The hues a tile's live charts draw each piece in (docs/web.md, 「Monitor screen」), outside
// the four steps of heat: its line, and its name in a step that reads as text in either theme.
// Written out class and all, as the steps are.
export interface SeriesColour {
  line: string;
  text: string;
}

const SERIES_COLOURS: SeriesColour[] = [
  { line: "stroke-blue-600", text: "text-blue-700 dark:text-blue-400" },
  { line: "stroke-pink-600", text: "text-pink-700 dark:text-pink-400" },
  { line: "stroke-cyan-600", text: "text-cyan-700 dark:text-cyan-400" },
];

const SERIES_BEYOND: SeriesColour = { line: "stroke-(--ui-text-dimmed)", text: "text-muted" };

// The CPU takes the first hue and the GPUs the next in their order, so a piece keeps its hue on
// every reading; any piece beyond them takes the quiet one.
export function seriesColour(place: number): SeriesColour {
  return SERIES_COLOURS[place] ?? SERIES_BEYOND;
}

// A figure against its most, its unit written once: `45.0 / 200.0 W`; the figure alone where the
// most was not read.
export function againstText(t: Translate, value: number | null, most: number | null, figure: (value: number) => string, unit: string): string {
  if (value === null) return t(UNREAD);

  return most === null ? `${figure(value)} ${unit}` : `${figure(value)} / ${figure(most)} ${unit}`;
}

export function wattsFigure(watts: number): string {
  return watts.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function mhzFigure(mhz: number): string {
  return countText(Math.round(mhz));
}

// A drive's own size as its maker states it, in decimal units.
export function driveSizeText(t: Translate, bytes: number | null): string {
  if (bytes === null) return t(UNREAD);

  const tb = bytes / 1e12;

  return tb >= 1 ? `${tb.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} TB` : `${countText(Math.round(bytes / 1e9))} GB`;
}

const STORAGE_WORDS: Record<StorageKind, string> = {
  nvme: "hardware.label.storage_nvme",
  ssd: "hardware.label.storage_ssd",
  hdd: "hardware.label.storage_hdd",
  usb: "hardware.label.storage_usb",
  virtual: "hardware.label.storage_virtual",
  network: "hardware.label.storage_network"
};

export function storageKindWord(t: Translate, kind: StorageKind | null): string | null {
  return kind === null ? null : t(STORAGE_WORDS[kind]);
}

export function rpmText(t: Translate, rpm: number | null): string {
  return rpm === null ? t(UNREAD) : `${countText(rpm)} RPM`;
}

export function uptimeText(t: Translate, seconds: number | null): string {
  if (seconds === null) return t(UNREAD);

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  return days > 0
    ? t("common.label.days_hours", { d: countText(days), h: hours })
    : hours > 0
      ? t("common.label.hours_minutes", { h: hours, m: minutes })
      : t("common.label.minutes", { m: minutes });
}

export function loadText(t: Translate, load: [number, number, number] | null): string {
  return load === null ? t(UNREAD) : load.map((one) => one.toFixed(2)).join(" · ");
}

// How often an open screen asks for a recorded span again: as often as one of its points is wide, so
// its last point keeps up, and once a minute at most, which is how often the record gains a stretch.
const HISTORY_POLL_MOST_MS = 60_000;

export function spanPollMs(span: HistorySpan): number {
  return Math.min(HISTORY_POLL_MOST_MS, Math.max(LIVE_PERIOD_MS, HISTORY_SPANS[span].pointSeconds * 1_000));
}


export type ReadStatus = "idle" | "pending" | "success" | "error";

// One address read again at an interval while the screen stands and its tab is visible. The last
// answer stays on the screen while the next is asked; a read that fails keeps nothing stale and says
// why. `settled` is told of every read that came back, answered or failed. A read still out at the
// deadline is let go, so an answer that never comes cannot hold the screen past it.
function usePolledRead<T>(url: Ref<string | null>, everyMs: number, settled?: (answer: T | null) => void, deadlineMs = 0): { value: Ref<T | null>; status: Ref<ReadStatus>; error: Ref<string | null> } {
  const value = ref<T | null>(null) as Ref<T | null>;
  const status = ref<ReadStatus>("idle");
  const error = ref<string | null>(null);
  let inFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let asked = 0;

  async function read(): Promise<void> {
    const target = url.value;

    if (target === null || inFlight || (typeof document !== "undefined" && document.hidden)) return;

    inFlight = true;
    const ask = ++asked;
    const abort = deadlineMs === 0 ? null : new AbortController();
    const cutoff = abort === null ? null : setTimeout(() => abort.abort(), deadlineMs);

    if (status.value === "idle") status.value = "pending";

    try {
      const answer = (await $fetch(target, abort === null ? undefined : { signal: abort.signal })) as T;

      if (ask === asked) {
        value.value = answer;
        error.value = null;
        status.value = "success";
        settled?.(answer);
      }
    } catch (caught) {
      if (ask === asked) {
        value.value = null;
        error.value = caught instanceof Error ? caught.message : String(caught);
        status.value = "error";
        settled?.(null);
      }
    } finally {
      if (cutoff !== null) clearTimeout(cutoff);
      inFlight = false;
    }
  }

  function onVisible(): void {
    if (!document.hidden) void read();
  }

  onMounted(() => {
    void read();
    timer = setInterval(() => void read(), everyMs);
    document.addEventListener("visibilitychange", onVisible);
  });

  onScopeDispose(() => {
    if (timer !== null) clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  });

  watch(url, () => {
    asked++;
    inFlight = false;
    value.value = null;
    status.value = "idle";
    void read();
  });

  return { value, status, error };
}

// The readings a page has kept of one machine for its live drawing, and the instant its window ends
// at — the last time the machine was asked, whether it answered or not.
export interface LiveKeeping {
  points: ShallowRef<LivePoint[]>;
  now: Ref<number>;
}

// Where a screen's live drawing comes from: the machine's live record, and the figures it draws
// where it draws only some — every one where it names none.
export interface LiveSource {
  url: string;
  metrics: readonly string[];
}

interface Kept extends LiveKeeping {
  filling: Promise<void> | null;
}

// Kept by what was asked for, so a screen going back to a machine keeps what it had, and a tile and
// a monitor each keep their own. It lives as long as the page does.
const liveKept = new Map<string, Kept>();

function keptOf(source: LiveSource): Kept {
  const key = `${source.url}?${source.metrics.join(",")}`;
  let kept = liveKept.get(key);

  if (kept === undefined) {
    kept = { points: shallowRef([]), now: ref(0), filling: null };
    liveKept.set(key, kept);
  }

  return kept;
}

export function liveKeeping(source: LiveSource): LiveKeeping {
  return keptOf(source);
}

// Readings taken into the keeping in the order they were taken, one to an instant, and what has
// fallen out of the window let go.
function keepPoints(kept: LiveKeeping, added: readonly LivePoint[], nowSeconds: number): void {
  const since = nowSeconds - LIVE_CHART_SECONDS;
  const byInstant = new Map<number, LivePoint>();

  for (const one of [...kept.points.value, ...added]) if (one.at >= since) byInstant.set(one.at, one);

  const points = [...byInstant.values()].sort((a, b) => a.at - b.at);
  const last = kept.points.value.at(-1);

  if (points.length !== kept.points.value.length || points.at(-1) !== last) kept.points.value = points;
}

// One answer taken into the keeping: its figures, under the names the record uses, once per
// reading.
export function keepLive(kept: LiveKeeping, answer: MachineHardware | null, nowSeconds: number): void {
  const last = kept.points.value.at(-1);
  const fresh = answer?.hardware != null && (last === undefined || answer.readAt > last.at);

  keepPoints(kept, fresh ? [{ at: answer.readAt, sample: historySample(answer.hardware!) }] : [], nowSeconds);
  kept.now.value = nowSeconds;
}

// The live record's readings as the keeping holds them.
export function rangeLivePoints(range: LiveRange): LivePoint[] {
  const entries = Object.entries(range.series);

  return range.at.map((at, index) => {
    const sample: Record<string, number> = {};

    for (const [key, column] of entries) {
      const value = column[index];

      if (value !== null && value !== undefined) sample[key] = value;
    }

    return { at, sample };
  });
}

// What the live record holds that the keeping does not: everything within its reach on a first
// asking, and what came after the last kept reading on a later one — after the tab was hidden, or
// the screen left and come back to.
async function fillLive(source: LiveSource): Promise<void> {
  const kept = keptOf(source);

  if (kept.filling !== null) return await kept.filling;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const since = kept.points.value.at(-1)?.at ?? nowSeconds - LIVE_CHART_SECONDS;
  const query = source.metrics.length > 0 ? { since, metrics: source.metrics.join(",") } : { since };

  kept.filling = (async () => {
    try {
      const range = (await $fetch(source.url, { query })) as LiveRange;

      keepPoints(kept, rangeLivePoints(range), Math.floor(Date.now() / 1000));
      if (kept.now.value === 0) kept.now.value = nowSeconds;
    } catch {
      // A record that cannot be asked leaves the drawing to the readings the screen takes itself.
    } finally {
      kept.filling = null;
    }
  })();

  await kept.filling;
}

// One machine's live drawing, filled from its record on opening and on coming back, and extended by
// each recorded reading the screen already holds of it.
export function useMachineLive(live: LiveSource, reading?: () => MachineHardware | null): LiveKeeping {
  const kept = keptOf(live);

  if (reading !== undefined) {
    watch(reading, (answer) => keepLive(kept, answer, Math.floor(Date.now() / 1000)));
  }

  function onVisible(): void {
    if (!document.hidden) void fillLive(live);
  }

  onMounted(() => {
    void fillLive(live);
    document.addEventListener("visibilitychange", onVisible);
  });

  onScopeDispose(() => {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  });

  return kept;
}

// One machine's live reading, every period while the screen is open and visible, each answer kept
// for the live drawing; the live record fills the drawing in on opening and on coming back.
export function useMachineHardware(url: Ref<string | null>, live: LiveSource): { machine: Ref<MachineHardware | null>; status: Ref<ReadStatus>; error: Ref<string | null>; live: LiveKeeping } {
  const kept = useMachineLive(live);
  const { value, status, error } = usePolledRead<MachineHardware>(url, LIVE_PERIOD_MS, (answer) => {
    keepLive(kept, answer, Math.floor(Date.now() / 1000));
  });

  return { machine: value, status, error, live: kept };
}

// Every machine's recorded reading at once, every period while the overview stands and its tab is
// visible. The node service answers the recorder's own for every machine and reads none, so no
// machine can hold another's tile; a request still out at the deadline is let go and the next period
// asks again, so one stalled answer never lengthens the interval.
export function useMonitorReadings(): { readings: Ref<MachineHardware[]>; status: Ref<ReadStatus>; error: Ref<string | null> } {
  const { value, status, error } = usePolledRead<MachineHardware[]>(ref(MONITOR_READINGS_URL), LIVE_PERIOD_MS, undefined, 2 * LIVE_PERIOD_MS);

  return { readings: computed(() => value.value ?? []), status, error };
}

// One machine's live tracking switch (bmo-node's docs/hardware.md, 「Tracking」). Where it stands is the
// reading's; while a move is out, and until the reading has caught up with it, it stands where it was
// moved to. A move refused puts it back with the reason.
export interface HardwareTracking {
  on: ComputedRef<boolean>;
  busy: Ref<boolean>;
  failed: Ref<string | null>;
  set: (on: boolean) => Promise<void>;
}

export function useHardwareTracking(t: Translate, reading: Ref<MachineHardware | null>): HardwareTracking {
  const wanted = ref<boolean | null>(null);
  const busy = ref(false);
  const failed = ref<string | null>(null);

  watch(
    () => reading.value?.tracking,
    (now) => {
      if (!busy.value && now === wanted.value) wanted.value = null;
    }
  );

  async function set(on: boolean): Promise<void> {
    const machine = reading.value?.name;

    if (machine === undefined || busy.value) return;

    busy.value = true;
    failed.value = null;
    wanted.value = on;

    try {
      await $fetch(TRACKING_URL, { method: "POST", body: { machine, on } });
      if (reading.value?.tracking === on) wanted.value = null;
    } catch (error) {
      wanted.value = null;
      failed.value = failureText(error, t("hardware.error.tracking_failed"));
    } finally {
      busy.value = false;
    }
  }

  return { on: computed(() => wanted.value ?? reading.value?.tracking ?? true), busy, failed, set };
}

// One machine's CPU limit, set or cleared (bmo-node's docs/hardware.md, 「Temperature limits」). The limit set is
// the reading's; while a change is out, and until the reading has caught up with it, it stands where it
// was set to. A change refused leaves it where it was, with the reason.
export interface HardwareCpuLimit {
  limit: ComputedRef<TemperatureLimit | null>;
  busy: Ref<boolean>;
  failed: Ref<string | null>;
  set: (celsius: number | null) => Promise<boolean>;
}

export function useHardwareCpuLimit(t: Translate, reading: Ref<MachineHardware | null>): HardwareCpuLimit {
  const wanted = ref<{ celsius: number | null } | null>(null);
  const busy = ref(false);
  const failed = ref<string | null>(null);

  watch(
    () => reading.value?.cpuLimit,
    (now) => {
      if (!busy.value && now === wanted.value?.celsius) wanted.value = null;
    }
  );

  async function set(celsius: number | null): Promise<boolean> {
    const machine = reading.value?.name;

    if (machine === undefined || busy.value) return false;

    busy.value = true;
    failed.value = null;

    try {
      await $fetch(CPU_LIMIT_URL, { method: "POST", body: { machine, celsius } });
      wanted.value = reading.value?.cpuLimit === celsius ? null : { celsius };

      return true;
    } catch (error) {
      failed.value = failureText(error, t("hardware.error.cpu_limit_failed"));

      return false;
    } finally {
      busy.value = false;
    }
  }

  const limit = computed(() => {
    if (wanted.value === null) return cpuLimitOf(reading.value);

    return limitOf(wanted.value.celsius, "set") ?? limitOf(reading.value?.hardware?.cpu.limitCelsius ?? null, "chip");
  });

  return { limit, busy, failed, set };
}

// A span in the words its switch says it in.
const SPAN_WORDS: Record<HistorySpan, string> = {
  "5m": "hardware.label.span_5m",
  "15m": "hardware.label.span_15m",
  "1h": "hardware.label.span_1h",
  "6h": "hardware.label.span_6h",
  "24h": "hardware.label.span_24h",
  "7d": "hardware.label.span_7d",
  "30d": "hardware.label.span_30d",
};

export function spanWord(t: Translate, span: HistorySpan): string {
  return t(SPAN_WORDS[span]);
}

export function spanUrl(historyUrl: string, span: HistorySpan): string {
  return `${historyUrl}?span=${span}`;
}

// A machine's recorded spans, each read — and read again each minute — only once some card has
// asked for it, so a card left on 24h costs no week or month.
export interface HardwareRanges {
  range: (span: HistorySpan) => HistoryRange | null;
  initial: (span: HistorySpan) => boolean;
  want: (span: HistorySpan) => void;
}

export function useHardwareRanges(historyUrl: Ref<string>): HardwareRanges {
  const wanted = ref<HistorySpan[]>([]);
  const reads = Object.fromEntries(HISTORY_SPAN_NAMES.map((span) => [span, usePolledRead<HistoryRange>(computed(() => (wanted.value.includes(span) ? spanUrl(historyUrl.value, span) : null)), spanPollMs(span))])) as Record<HistorySpan, ReturnType<typeof usePolledRead<HistoryRange>>>;

  return {
    range: (span) => reads[span].value.value,
    // Waiting on its first answer: asked for and nothing come back yet, or not asked for at all.
    initial: (span) => reads[span].value.value === null && reads[span].status.value !== "error",
    want: (span) => {
      if (!wanted.value.includes(span)) wanted.value = [...wanted.value, span];
    },
  };
}

// One figure a card charts: the series it is recorded under, what it is called, how its value is
// written and the top of its axis — its whole where it has one, null to rise a little over its
// highest.
export interface HardwareFigure {
  key: string;
  label: string;
  format: (value: number) => string;
  ceiling: number | null;
}

// What a monitor hands every card for its charts: the live readings and the recorded spans, and
// whether the machine's first reading is still out.
export interface HardwareCharting {
  live: LiveKeeping;
  ranges: HardwareRanges;
  loading: Ref<boolean>;
}

export const HARDWARE_CHARTING: InjectionKey<HardwareCharting> = Symbol("hardware-charting");

// One fact of a machine's system or connection card; the tone is the machine font for what a
// machine wrote, or a state's colour.
export interface MonitorFact {
  label: string;
  value: string;
  tone?: string;
}

// Whether a group of meters keeps a column for the share after each figure.
export const HARDWARE_METER_SHARES: InjectionKey<Readonly<Ref<boolean>>> = Symbol("hardware-meter-shares");
