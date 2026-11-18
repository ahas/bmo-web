import { existsSync } from "node:fs";

import type { BrowserType, Page } from "playwright-core";

// What the copy tests share to read a clipboard in an engine as it ships: one with no clipboard permission granted,
// whose own clipboard a page cannot read, so what landed is read the way a person reads it, by pasting it.

// Whether the build of the engine this version pins is on the machine; a test of it skips where it is not.
export function engineReady(engine: BrowserType): boolean {
  try {
    return existsSync(engine.executablePath());
  } catch {
    return false;
  }
}

// What the clipboard holds, pasted by the keyboard into a box laid over the page, which is taken away again. The
// box stands outside any dialog, so a dialog holding the focus is closed before this is asked.
export async function pastedText(page: Page): Promise<string> {
  await page.evaluate(() => {
    const box = document.createElement("textarea");

    box.id = "test-paste";
    box.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647";
    document.body.appendChild(box);
    box.focus();
  });
  await page.keyboard.press("ControlOrMeta+V");
  await page.waitForFunction(() => (document.getElementById("test-paste") as HTMLTextAreaElement | null)?.value !== "", null, { timeout: 5_000 });

  return await page.evaluate(() => {
    const box = document.getElementById("test-paste") as HTMLTextAreaElement;

    box.remove();

    return box.value;
  });
}
