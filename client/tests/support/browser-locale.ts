import { chromium, firefox, webkit } from "playwright-core";

import type { Browser, BrowserType } from "playwright-core";

// The language every browser the tests launch speaks unless the test names another (docs/checks.md, 「The browsers'
// language」). The tests read the console's words in Korean through `wording`, and a browser left to itself lists its
// own build's language, which the console follows for a reader whose account names none; so a context or page opened
// with no locale lists Korean, and a test about another language passes its own `locale`, which stands.
export const BROWSER_LOCALE = "ko-KR";

for (const engine of [chromium, firefox, webkit] as BrowserType[]) {
  const launch = engine.launch.bind(engine);

  engine.launch = async (...given: Parameters<BrowserType["launch"]>) => speakingKorean(await launch(...given));
}

function speakingKorean(browser: Browser): Browser {
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);

  browser.newContext = async (options = {}) => await newContext({ locale: BROWSER_LOCALE, ...options });
  browser.newPage = async (options = {}) => await newPage({ locale: BROWSER_LOCALE, ...options });

  return browser;
}
