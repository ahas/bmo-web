import type { SeriesColour } from "./hardware";
import type { HistoryRange } from "#shared/types";

// What a hardware chart draws (bmo-node's docs/hardware.md, 「Live」; docs/web.md, 「Monitor screen」): points on a time
// axis, each a value and, for a recorded span, the lowest and highest around it, parted into runs
// wherever the record has a hole. Pure, so the drawing is only the drawing.

export interface ChartPoint {
  // Seconds since the epoch.
  at: number;
  value: number;
  min: number;
  max: number;
}

// The live readings a page has kept for one machine: when each was taken and its figures.
export interface LivePoint {
  at: number;
  sample: Record<string, number>;
}

// One piece's line among several drawn on one axis, in the hue that piece wears.
export interface LiveSeries {
  key: string;
  label: string;
  colour: SeriesColour;
  points: (ChartPoint | null)[];
}

// One figure out of the live readings; a reading that did not carry it is a hole.
export function livePoints(points: readonly LivePoint[], key: string): (ChartPoint | null)[] {
  return points.map((point) => {
    const value = point.sample[key];

    return value === undefined ? null : { at: point.at, value, min: value, max: value };
  });
}

// One figure out of a recorded span, each point standing at the middle of its stretch.
export function rangePoints(range: HistoryRange, key: string): (ChartPoint | null)[] {
  const band = range.series[key];

  return range.at.map((at, index) => {
    const mean = band?.mean[index] ?? null;
    const min = band?.min[index] ?? null;
    const max = band?.max[index] ?? null;

    return mean === null || min === null || max === null ? null : { at: at + range.pointSeconds / 2, value: mean, min, max };
  });
}

// The stretches drawn as one line: a hole, or two points further apart than `gap`, parts them.
export function chartRuns(points: readonly (ChartPoint | null)[], gap: number): ChartPoint[][] {
  const runs: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  for (const point of points) {
    const last = current.at(-1);

    if (point === null || (last !== undefined && point.at - last.at > gap)) {
      if (current.length > 0) runs.push(current);
      current = [];
    }

    if (point !== null) current.push(point);
  }

  if (current.length > 0) runs.push(current);

  return runs;
}

// The lowest and the highest a set of points reached; null where it holds none.
export function chartExtent(points: readonly (ChartPoint | null)[]): { min: number; max: number } | null {
  let found: { min: number; max: number } | null = null;

  for (const point of points) {
    if (point === null) continue;

    found = found === null ? { min: point.min, max: point.max } : { min: Math.min(found.min, point.min), max: Math.max(found.max, point.max) };
  }

  return found;
}

// The top of the axis: a figure's fixed ceiling, or a little over its highest where it has none.
export function chartTop(ceiling: number | null, extent: { max: number } | null): number {
  if (ceiling !== null && ceiling > 0) return ceiling;

  return Math.max(1, (extent?.max ?? 0) * 1.15);
}

// The point nearest an instant; null where there is none.
export function nearestPoint(points: readonly (ChartPoint | null)[], at: number): ChartPoint | null {
  let found: ChartPoint | null = null;

  for (const point of points) {
    if (point !== null && (found === null || Math.abs(point.at - at) < Math.abs(found.at - at))) found = point;
  }

  return found;
}

// A run as SVG path commands in a box `width` by `height`, `from`..`to` across and nought..`top` up.
export interface ChartFrame {
  from: number;
  to: number;
  top: number;
  width: number;
  height: number;
}

export function chartX(frame: ChartFrame, at: number): number {
  return frame.to <= frame.from ? 0 : ((at - frame.from) / (frame.to - frame.from)) * frame.width;
}

export function chartY(frame: ChartFrame, value: number): number {
  return frame.height - (Math.min(Math.max(value, 0), frame.top) / frame.top) * frame.height;
}

function commands(pairs: readonly [number, number][]): string {
  return pairs.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// A run of one point is drawn a few units wide so it is seen at all.
function spread(frame: ChartFrame, run: readonly ChartPoint[]): { x: number; point: ChartPoint }[] {
  if (run.length === 1) {
    const x = chartX(frame, run[0]!.at);

    return [{ x: x - 2, point: run[0]! }, { x: x + 2, point: run[0]! }];
  }

  return run.map((point) => ({ x: chartX(frame, point.at), point }));
}

export function linePath(frame: ChartFrame, run: readonly ChartPoint[]): string {
  return commands(spread(frame, run).map(({ x, point }) => [x, chartY(frame, point.value)]));
}

// The area under a run, down to the axis.
export function areaPath(frame: ChartFrame, run: readonly ChartPoint[]): string {
  const placed = spread(frame, run);

  return `${linePath(frame, run)} L${placed.at(-1)!.x.toFixed(1)},${frame.height} L${placed[0]!.x.toFixed(1)},${frame.height} Z`;
}

// The band between a run's lowest and highest: along the highest, back along the lowest.
export function bandPath(frame: ChartFrame, run: readonly ChartPoint[]): string {
  const placed = spread(frame, run);
  const upper = placed.map(({ x, point }): [number, number] => [x, chartY(frame, point.max)]);
  const lower = [...placed].reverse().map(({ x, point }): [number, number] => [x, chartY(frame, point.min)]);

  return `${commands([...upper, ...lower])} Z`;
}
