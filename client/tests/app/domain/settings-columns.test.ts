import { describe, expect, test } from "bun:test";

import { giveOutWidths, TITLE_FLOOR_PX } from "../../../apps/web/app/domain/settings-columns";

// How a settings table gives out its box's width (docs/web.md, 「Agent management screen」): every content column its
// content up to its ceiling and the title its floor, then the title up to its words, then the cut columns toward their
// content, and what is left to the title.

const sum = (widths: Record<string, number>) => Object.values(widths).reduce((all, one) => all + one, 0);

describe("the widths a settings table gives out", () => {
  test("give a cut column the room before the title stands wider than its words", () => {
    const widths = giveOutWidths(1592, [
      { id: "name", content: 172, title: true },
      { id: "text", content: 3320, ceiling: 592 }
    ]);

    expect(widths).toEqual({ name: 172, text: 1420 });
  });

  test("leave the title what no column asks for once every column stands whole", () => {
    const widths = giveOutWidths(1000, [
      { id: "role", content: 136, title: true },
      { id: "order", content: 204 },
      { id: "rooms", content: 200, ceiling: 288 },
      { id: "actions", content: 36 }
    ]);

    expect(widths).toEqual({ role: 560, order: 204, rooms: 200, actions: 36 });
    expect(sum(widths)).toBe(1000);
  });

  test("grow the cut columns evenly, each stopping at its content", () => {
    const widths = giveOutWidths(900, [
      { id: "title", content: 100, title: true },
      { id: "short", content: 340, ceiling: 300 },
      { id: "long", content: 2000, ceiling: 300 }
    ]);

    expect(widths).toEqual({ title: 100, short: 340, long: 460 });
  });

  test("hold the title to its floor and a column to its ceiling where the box is short, the table scrolling", () => {
    const widths = giveOutWidths(500, [
      { id: "title", content: 400, title: true },
      { id: "path", content: 900, ceiling: 320 },
      { id: "count", content: 60 }
    ]);

    expect(widths).toEqual({ title: TITLE_FLOOR_PX, path: 320, count: 60 });
    expect(sum(widths)).toBeGreaterThan(500);
  });

  test("give the title its words before any cut column grows", () => {
    const widths = giveOutWidths(600, [
      { id: "title", content: 260, title: true },
      { id: "rooms", content: 800, ceiling: 288 }
    ]);

    expect(widths).toEqual({ title: 260, rooms: 340 });
  });
});
