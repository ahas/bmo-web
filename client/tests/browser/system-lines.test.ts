import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import fixedLines from "../../../server/lang/ko/fixed-lines.yaml";
import particles from "../../../server/lang/ko/particles.yaml";
import roads from "../../../server/lang/ko/roads.yaml";
import { HANDED_AGENT, MARKED_WORDS, NOTICE_MARKS, SYSTEM_IDS, SYSTEM_ROOM } from "../support/system-room";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A room's system lines (docs/web.md, 「A system notice stands as a system line, not a bubble」 and 「A fixed line stands
// as a system line too」), read in Korean at a desk's width and a phone's: the service's stop stands centred with no
// bubble and no mark, a row the archive kept with the notice mark stands the same way without it, and a session handed
// over names the supervisor by the label the agency gives it, with the particle that label takes, never by its key or
// with both particles; a person's words beside them keep their bubble. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "system-lines", password: "fixture-password-4127" };
const RESTARTING = (roads as { service: { stopping: { restarting: string } } }).service.stopping.restarting;
const SUBJECT = (particles as { subject: { open: string; unknown: string } }).subject;
const HANDED_OVER = (fixedLines as { session_handed_over: { handed_over: string } }).session_handed_over.handed_over;

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

interface Drawn {
  id: string;
  notice: boolean;
  bubble: boolean;
  words: string;
  left: number;
  right: number;
  centre: number;
}

describe.skipIf(!origin || !touchReady())("a room's system lines", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stand as system lines with no mark, the handover naming its supervisor's label, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${SYSTEM_ROOM}`, { waitUntil: "load" });
        await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => document.querySelectorAll("[data-message]").length >= 4, undefined, { timeout: 20_000 });

        const drawn: Drawn[] = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-message]")].map((row) => {
          const words = row.querySelector<HTMLElement>("[data-words]:not([data-name])");
          const box = (words ?? row).getBoundingClientRect();

          return {
            id: row.getAttribute("data-message") ?? "",
            notice: row.querySelector("[data-notice]") !== null,
            bubble: row.querySelector("[data-bubble]") !== null,
            words: words?.textContent?.trim() ?? "",
            left: box.left,
            right: box.right,
            centre: box.left + box.width / 2
          };
        }));
        const viewport = page.viewportSize()!;
        const row = (id: string): Drawn => {
          const found = drawn.find((one) => one.id.endsWith(id));

          expect(found).toBeDefined();

          return found!;
        };

        // The person's words keep their bubble; every line the service said stands as a system line, with none.
        expect(row(SYSTEM_IDS.words)).toMatchObject({ notice: false, bubble: true });

        for (const id of [SYSTEM_IDS.marked, SYSTEM_IDS.stop, SYSTEM_IDS.handover]) {
          const line = row(id);

          expect(line).toMatchObject({ notice: true, bubble: false });
          expect(line.left).toBeGreaterThanOrEqual(0);
          expect(line.right).toBeLessThanOrEqual(viewport.width);
        }

        // The stop is the pack's sentence alone, and the marked row its words without the mark.
        expect(row(SYSTEM_IDS.stop).words).toContain(RESTARTING);
        expect(row(SYSTEM_IDS.marked).words).toContain(MARKED_WORDS);

        for (const mark of NOTICE_MARKS) expect(drawn.some((one) => one.words.includes(mark))).toBe(false);

        // The handover names the supervisor by its label with the one particle its last sound takes.
        const handover = row(SYSTEM_IDS.handover).words;
        const opening = HANDED_OVER.split("{subject}")[0]!.replaceAll("{agent}", HANDED_AGENT.label);

        expect(handover).toContain(`${opening}${HANDED_AGENT.label}${SUBJECT.open}`);
        expect(handover).not.toContain(HANDED_AGENT.key);
        expect(handover).not.toContain(SUBJECT.unknown);

        // No row is wider than the screen, so nothing is reached by scrolling sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
