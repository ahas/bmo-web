import { describe, expect, test } from "bun:test";

import { BRIEFING_POSITION_DEFAULT, footClearance, positionOf } from "../../../apps/web/app/domain/briefing-position";

// Where the briefing's player stands (docs/web.md, 「Messages」, the briefing's player); how a press becomes a drag
// and which side a drag settles on are the shared layer's floating-drag module's, and its own tests'.

const rect = (top: number, bottom: number): DOMRect => ({ top, bottom, height: bottom - top, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) });

describe("the bar at the screen's foot", () => {
  test("it keeps above the tallest bar standing at the page area's foot, and above nothing where none stands", () => {
    const area = rect(0, 800);

    expect(footClearance(area, [rect(700, 800)])).toBe(100);
    expect(footClearance(area, [rect(740, 800), rect(650, 800)])).toBe(150);
    expect(footClearance(area, [rect(0, 0)])).toBe(0);
    expect(footClearance(area, [])).toBe(0);
  });
});

describe("what the browser keeps", () => {
  test("the side and the height, read back as whole pixels", () => {
    expect(positionOf(JSON.stringify({ side: "left", top: 240.4 }))).toEqual({ side: "left", top: 240 });
  });

  test("nothing kept, or anything unreadable, is the first position: the bottom right", () => {
    expect(BRIEFING_POSITION_DEFAULT).toEqual({ side: "right", top: null });
    expect(positionOf(null)).toEqual(BRIEFING_POSITION_DEFAULT);
    expect(positionOf("{")).toEqual(BRIEFING_POSITION_DEFAULT);
    expect(positionOf(JSON.stringify({ side: "up", top: -30 }))).toEqual({ side: "right", top: 0 });
  });
});
