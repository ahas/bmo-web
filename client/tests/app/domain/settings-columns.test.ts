import { describe, expect, test } from "bun:test";

import { columnWidths } from "../../../apps/web/app/domain/settings-columns";

// How a settings table lays its columns out (docs/web.md, 「Agent management screen」): as a spreadsheet does, every
// column at its own content's width up to its ceiling, no column taking the room left over.

describe("the widths a settings table lays its columns out at", () => {
  test("stand every column, the title's among them, at its content's width", () => {
    expect(columnWidths([{ id: "role", content: 136 }, { id: "order", content: 204 }, { id: "actions", content: 36 }])).toEqual({ role: 136, order: 204, actions: 36 });
  });

  test("hold a column whose cells vary in length to its ceiling", () => {
    expect(columnWidths([{ id: "name", content: 172 }, { id: "text", content: 3320, ceiling: 592 }, { id: "rooms", content: 200, ceiling: 288 }])).toEqual({ name: 172, text: 592, rooms: 200 });
  });

  test("take a part of a pixel as a whole one", () => {
    expect(columnWidths([{ id: "size", content: 55.2 }])).toEqual({ size: 56 });
  });
});
