import { ORGANIZATION_TABS } from "../../apps/web/app/domain/organization";
import { wording } from "../../apps/web/shared/wording";

import type { Page } from "playwright-core";

// The platform screen's tabs the node holds, every group's, in the tabs' own order (docs/web.md, 「System and
// organisation」): the row shows one group's tabs, so each group is pressed in turn and its tabs read, and the page is
// taken back to the address it stood on. Where no group row stands, the node holds one group and its row is read as it
// stands.
export async function platformTabs(page: Page, rowLabel = "organization.aria.tabs"): Promise<string[]> {
  const row = page.locator(`[aria-label="${wording(rowLabel)}"]`);

  await row.waitFor({ timeout: 20_000 });

  const read = async () => (await row.getByRole("tab").allInnerTexts()).map((one) => one.trim());
  const groups = page.locator(`[aria-label="${wording("organization.aria.groups")}"]`).getByRole("tab");

  if ((await groups.count()) === 0) return await read();

  const start = page.url();
  const names: string[] = [];

  for (let at = 0; at < (await groups.count()); at += 1) {
    const group = groups.nth(at);

    if ((await group.getAttribute("aria-selected")) !== "true") {
      const before = page.url();

      await group.click();
      await page.waitForURL((url) => url.toString() !== before, { timeout: 15_000 }).catch(() => undefined);
    }

    await page.waitForFunction((label) => (document.querySelector(`[aria-label="${label}"]`)?.querySelectorAll('[role="tab"]').length ?? 0) > 0, wording(rowLabel), { timeout: 15_000 });
    names.push(...(await read()));
  }

  if (page.url() !== start) {
    await page.goto(start, { waitUntil: "load" });
    await row.waitFor({ timeout: 20_000 });
  }

  const order = ORGANIZATION_TABS.map((tab) => wording(tab.label));
  const at = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);

  return [...names].sort((one, other) => at(one) - at(other));
}
