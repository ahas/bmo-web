// The room information a room's name opens (docs/web.md, the room screen's room information), as the browser tests
// find it: the one dialog holding its row of tabs, opened from the name and standing on a tab its label names.

import type { Locator, Page } from "playwright-core";

/** The room information standing over the room's screen. */
export function roomInfo(page: Page): Locator {
  return page.getByRole("dialog").filter({ has: page.locator("[data-room-info-tabs]") });
}

/** The room information opened from the room's name, standing on the tab whose label is given, where one is. */
export async function openRoomInfo(page: Page, tab?: string): Promise<Locator> {
  const sheet = roomInfo(page);

  await page.locator("[data-room-name]").click();
  await sheet.waitFor({ timeout: 10_000 });
  if (tab !== undefined) await sheet.getByRole("tab", { name: tab, exact: true }).click();

  return sheet;
}
