import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator, Page } from "playwright-core";

// A supervisor's session handed over and reset from the room's menu (docs/web.md, 「A supervisor's session handed over
// or reset」), worked by hand at a desk's width and a phone's, in the record room the harness's receiver stands, which
// the default answerer answers: the menu offers both acts; the handover names what it does, says the room's record stays
// and waits for a reason, and its notice says the handover was asked; the reset says what goes and what stays and its
// notice says the reset was asked. The room's messages read the same after both. The console's server refuses a reader
// the supervisor is not theirs as if it did not stand, and answers a supervisor holding no session as having none.
// It drives the console tests/support/browser-console.ts stands up, whose receiver and agency stand-ins answer the
// handover and the reset only where they carry what the console owes them; the suite stands up no console, so there
// it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "session-acts", password: "fixture-password-4115" };
const MEMBER = { name: "tester", password: "fixture-password-3766" };
const RECORD_CHAT = -9_000_000_000_099;

let browser: Browser | null = null;
let cookie = "";

async function signIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookie = await signIn(ACCOUNT);
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// Pressed as a hand presses it once what closed has faded away: the control in view and inside the screen's width, the
// point at its centre holding the control itself, then a tap on a phone and a click at a desk.
async function press(page: Page, control: Locator, phone: boolean): Promise<void> {
  await control.waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector("[data-slot='overlay'][data-state='closed']") === null, undefined, { timeout: 10_000 });
  await control.scrollIntoViewIfNeeded();

  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  const covered = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    return top === null || element === top || element.contains(top) ? null : top.outerHTML.slice(0, 300);
  });

  expect(covered).toBeNull();
  if (phone) await control.tap();
  else await control.click();
}

// The room's messages as the console's server answers them, by their ids and words.
async function messages(page: Page): Promise<string> {
  const answer = await page.request.get(`${origin}/api/rooms/${RECORD_CHAT}/messages?limit=50`);

  expect(answer.ok()).toBe(true);

  return await answer.text();
}

describe.skipIf(!origin || !touchReady())("a supervisor's session from the room's menu", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`hands the session over and resets it, the room's record staying, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });

        const before = await messages(page);
        const menu = page.locator("[data-room-menu]").first();

        // The handover: the dialog says what it does and that the record stays, and waits for a reason.
        await press(page, menu, phone);
        await press(page, page.getByRole("menuitem", { name: wording("agent_session.action.handoff") }), phone);

        const dialog = page.locator("[data-agent-session-dialog][data-kind='handoff']");

        // Untouched, it closes at once and asks nothing; then it is opened again.
        await dialog.waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        await press(page, menu, phone);
        await press(page, page.getByRole("menuitem", { name: wording("agent_session.action.handoff") }), phone);
        await dialog.waitFor({ timeout: 10_000 });
        await expect(dialog.locator("[data-agent-session-stays]").textContent()).resolves.toBe(wording("agent_session.message.record_stays"));

        const confirm = page.locator("[data-agent-session-confirm]");

        await expect(confirm.isDisabled()).resolves.toBe(true);
        await press(page, dialog.locator("[data-agent-session-reason]"), phone);
        await dialog.locator("[data-agent-session-reason]").fill("a clean start");
        await press(page, confirm, phone);
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        // The notice says it was asked, and stands at the head of the screen until it has been read.
        const asked = page.getByText(wording("agent_session.message.handoff_asked"), { exact: true }).first();

        await asked.waitFor({ timeout: 10_000 });
        await asked.waitFor({ state: "detached", timeout: 20_000 });

        // The reset: the confirmation says what goes and what stays, and its notice says it was asked.
        await press(page, menu, phone);
        await press(page, page.getByRole("menuitem", { name: wording("agent_session.action.reset") }), phone);

        const reset = page.locator("[data-agent-session-dialog][data-kind='reset']");

        await reset.waitFor({ timeout: 10_000 });
        await expect(reset.locator("[data-agent-session-effect]").textContent()).resolves.toBe(wording("agent_session.message.reset_effect", { name: "Agent A" }));
        await expect(reset.locator("[data-agent-session-stays]").textContent()).resolves.toBe(wording("agent_session.message.record_stays"));
        await press(page, page.locator("[data-agent-session-confirm]"), phone);
        await reset.waitFor({ state: "detached", timeout: 10_000 });
        await page.getByText(wording("agent_session.message.reset_asked"), { exact: true }).first().waitFor({ timeout: 10_000 });

        // Nothing of the room's record moved, and nothing ran off the side.
        expect(await messages(page)).toBe(before);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  test("refuses a reader the supervisor is not theirs, and says when there is no session", async () => {
    const member = await signIn(MEMBER);
    const asked = (as: string, agent: string, act: string, body: Record<string, unknown>) =>
      fetch(`${origin}/api/agents/${agent}/${act}`, { method: "POST", headers: { cookie: as, "content-type": "application/json" }, body: JSON.stringify(body) });

    await expect(asked(member, "agent-a", "session-handoff", { reason: "a clean start" }).then((answer) => answer.status)).resolves.toBe(404);
    await expect(asked(member, "agent-a", "session-reset", {}).then((answer) => answer.status)).resolves.toBe(404);
    await expect(asked(cookie, "agent-a", "session-handoff", { reason: " " }).then((answer) => answer.status)).resolves.toBe(400);
    await expect(asked(cookie, "agent-c", "session-reset", {}).then((answer) => answer.json())).resolves.toEqual({ outcome: "none" });
  }, 60_000);
});
