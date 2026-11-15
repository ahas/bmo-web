import type { Locator, Page } from "playwright-core";

import type { TouchPoint } from "./touch";

// Carrying a row of an ordered list by its handle, as the console's row drag reads it (docs/web.md, the draft
// block's question order and the repository dialog's prefix documents): a press on the handle, a travel in steps
// past the slack a drag starts at, and a let-go over the row it lands on. The marks a carried list puts on its rows
// are read while the press is still held, which is the only moment they stand.

// Where an element's centre stands on the screen.
export async function centre(locator: Locator): Promise<TouchPoint> {
  const box = await locator.boundingBox();

  if (box === null) throw new Error("the element is not on the screen");

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// The mouse pressed at `from`, carried in steps to `to`, and what `held` reads there taken before it lets go.
export async function carryByMouse<T>(page: Page, from: TouchPoint, to: TouchPoint, held: () => Promise<T>): Promise<T> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });

  const read = await held();

  await page.mouse.up();

  return read;
}

// Which row of a carried list stands as the one held and which as the one it would land on, by the marks the
// list puts on them.
export async function rowMarks(list: Locator): Promise<{ held: number[]; over: number[] }> {
  return await list.locator("[data-order-index]").evaluateAll((rows) => ({
    held: rows.filter((row) => row.classList.contains("outline-dashed")).map((row) => Number((row as HTMLElement).dataset.orderIndex)),
    over: rows.filter((row) => row.classList.contains("bg-primary/10")).map((row) => Number((row as HTMLElement).dataset.orderIndex))
  }));
}
