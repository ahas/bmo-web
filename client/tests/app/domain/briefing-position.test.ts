import { describe, expect, test } from "bun:test";

import { BRIEFING_POSITION_DEFAULT, clampTo, isDrag, positionOf, settledSide } from "../../../apps/web/app/domain/briefing-position";

const bounds = { minLeft: 16, maxLeft: 300, minTop: 72, maxTop: 500 };
const WIDTH = 100;

describe("a press and a drag", () => {
  test("a pointer that barely moves is still a press, and a finger is given more room than a mouse", () => {
    expect(isDrag(3, 0, "mouse")).toBe(false);
    expect(isDrag(4, 4, "mouse")).toBe(true);
    expect(isDrag(6, 6, "touch")).toBe(false);
    expect(isDrag(0, 11, "touch")).toBe(true);
  });
});

describe("while it is dragged", () => {
  test("it cannot pass the panel's edges, and a panel too small keeps it at the lower edge", () => {
    expect(clampTo(-40, bounds.minTop, bounds.maxTop)).toBe(72);
    expect(clampTo(900, bounds.minTop, bounds.maxTop)).toBe(500);
    expect(clampTo(200, bounds.minTop, bounds.maxTop)).toBe(200);
    expect(clampTo(50, 72, 40)).toBe(72);
  });
});

describe("where it settles", () => {
  test("on the side its centre is nearer to", () => {
    expect(settledSide(100, WIDTH, bounds, 0)).toBe("left");
    expect(settledSide(220, WIDTH, bounds, 0)).toBe("right");
  });

  test("a throw carries it to the side it was thrown toward", () => {
    expect(settledSide(100, WIDTH, bounds, 1200)).toBe("right");
    expect(settledSide(220, WIDTH, bounds, -1200)).toBe("left");
  });
});

describe("what the browser keeps", () => {
  test("the side and the height, read back as whole pixels", () => {
    expect(positionOf(JSON.stringify({ side: "right", top: 240.4 }))).toEqual({ side: "right", top: 240 });
  });

  test("nothing kept, or anything unreadable, is the first position", () => {
    expect(positionOf(null)).toEqual(BRIEFING_POSITION_DEFAULT);
    expect(positionOf("{")).toEqual(BRIEFING_POSITION_DEFAULT);
    expect(positionOf(JSON.stringify({ side: "up", top: -30 }))).toEqual({ side: "left", top: 0 });
  });
});
