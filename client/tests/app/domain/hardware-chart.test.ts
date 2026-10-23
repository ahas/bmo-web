import { describe, expect, test } from "bun:test";

import { bandPath, chartExtent, chartRuns, chartTop, chartY, linePath, livePoints, nearestPoint, rangePoints } from "../../../apps/web/app/domain/hardware-chart";

import type { ChartFrame, ChartPoint } from "../../../apps/web/app/domain/hardware-chart";

function at(instant: number, value: number, min = value, max = value): ChartPoint {
  return { at: instant, value, min, max };
}

const FRAME: ChartFrame = { from: 0, to: 100, top: 50, width: 1000, height: 100 };

describe("points", () => {
  test("a live figure is a hole where a reading did not carry it", () => {
    expect(livePoints([{ at: 1, sample: { "cpu|use": 10 } }, { at: 4, sample: {} }], "cpu|use")).toEqual([at(1, 10), null]);
  });

  test("a recorded point stands at the middle of its stretch with its lowest and highest", () => {
    const range = { at: [0, 300], pointSeconds: 300, series: { "cpu|temp": { min: [40, null], max: [60, null], mean: [50, null] } } };

    expect(rangePoints(range, "cpu|temp")).toEqual([at(150, 50, 40, 60), null]);
    expect(rangePoints(range, "gpu0|use")).toEqual([null, null]);
  });
});

describe("chartRuns", () => {
  test("a hole or a stretch longer than the gap parts the line", () => {
    const points = [at(0, 1), at(3, 2), null, at(9, 3), at(30, 4), at(33, 5)];

    expect(chartRuns(points, 15)).toEqual([[at(0, 1), at(3, 2)], [at(9, 3)], [at(30, 4), at(33, 5)]]);
  });
});

describe("axis", () => {
  test("a fixed ceiling stands; without one the top rises a little over the highest", () => {
    const extent = chartExtent([at(0, 20, 10, 40), null, at(5, 30, 5, 35)]);

    expect(extent).toEqual({ min: 5, max: 40 });
    expect(chartTop(100, extent)).toBe(100);
    expect(chartTop(null, extent)).toBeCloseTo(46);
    expect(chartTop(null, null)).toBe(1);
    expect(chartExtent([null])).toBeNull();
  });

  test("a value past the top is held to the edge", () => {
    expect(chartY(FRAME, 25)).toBe(50);
    expect(chartY(FRAME, 80)).toBe(0);
    expect(chartY(FRAME, -3)).toBe(100);
  });

  test("the nearest point to an instant answers a hover", () => {
    expect(nearestPoint([at(0, 1), null, at(10, 2)], 6)).toEqual(at(10, 2));
    expect(nearestPoint([null], 6)).toBeNull();
  });
});

describe("paths", () => {
  test("a line runs through the values and a band out along the highest and back along the lowest", () => {
    expect(linePath(FRAME, [at(0, 25), at(100, 50)])).toBe("M0.0,50.0 L1000.0,0.0");
    expect(bandPath(FRAME, [at(0, 25, 0, 50), at(100, 25, 10, 40)])).toBe("M0.0,0.0 L1000.0,20.0 L1000.0,80.0 L0.0,100.0 Z");
  });

  test("a lone point is drawn a few units wide", () => {
    expect(linePath(FRAME, [at(50, 25)])).toBe("M498.0,50.0 L502.0,50.0");
  });
});
