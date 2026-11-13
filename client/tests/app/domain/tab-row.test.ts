import { describe, expect, test } from "bun:test";

import { revealedOffset } from "../../../apps/web/app/domain/tab-row";

// A row of tabs scrolled sideways brings its open tab into view by the least move that does it (docs/web.md,
// 「Organisation settings」). The row stands at 0 on the page, 300 wide, its tabs 600 wide in all.
describe("the open tab brought into a row's view", () => {
  const row = (scrollLeft: number) => ({ left: 0, scrollLeft, clientWidth: 300, scrollWidth: 600 });

  test("a tab already wholly in view leaves the row where it stands", () => {
    expect(revealedOffset({ left: 40, width: 80 }, row(100))).toBe(100);
  });

  test("a tab past the row's end is brought in until its end meets the row's end", () => {
    expect(revealedOffset({ left: 260, width: 80 }, row(0))).toBe(40);
  });

  test("a tab before the row's start is brought in until its start meets the row's start", () => {
    expect(revealedOffset({ left: -60, width: 80 }, row(200))).toBe(140);
  });

  test("the offset never runs past what the row can scroll", () => {
    expect(revealedOffset({ left: 520, width: 200 }, row(0))).toBe(300);
  });
});
