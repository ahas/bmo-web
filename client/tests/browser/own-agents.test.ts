import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator, Page } from "playwright-core";
import type { Attachments, AttachmentHolder } from "../../apps/web/shared/attachments";

// The reader's own agents (docs/web.md, 「System and organisation」, the agents tab with the reader's own node chosen), worked by hand at a desk's width and a
// phone's: the agents the reader's organisation supplies stand with where they came from and their road; an agent
// added to a role stands as the reader's own; a road a supply does not carry stands disabled in the road's form, and
// one it carries is saved and makes the seat the reader's own change, which its way back puts back; a supplied agent is
// switched off and on; a role the organisation turned off and the instructions it withholds say so, the organisation's
// instructions read only; an agent's skills and MCP button opens the skills and MCP servers it is given, the group its line takes
// none of disabled and saying so, and saves what is checked, the agency's refusal said in the form. Every press lands on the control it says, nothing standing over it and nothing running off
// the side. It drives the console tests/support/browser-console.ts stands up, whose agency stand-in keeps the
// reader's agents; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "own-agents", password: "fixture-password-4114" };

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

// Pressed as a hand presses it once what closed has faded away: the control in view and inside the screen's width, the
// point at its centre holding the control itself, then a tap on a phone and a click at a desk.
async function press(page: Page, control: Locator, phone: boolean): Promise<void> {
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

// A choice picked from a select the way a hand picks it: the select pressed, then the choice in the list it opened.
async function pick(page: Page, select: Locator, choice: string, phone: boolean): Promise<void> {
  await press(page, select, phone);

  const option = page.getByRole("option", { name: choice, exact: false }).first();

  await option.waitFor({ timeout: 10_000 });
  if (phone) await option.tap();
  else await option.click();
}

describe.skipIf(!origin || !touchReady())("the reader's own agents tab", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`shows the supplied agents and lays the reader's changes over them, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?company=me&tab=agents`, { waitUntil: "load" });

        const list = page.locator("[data-own-agents-list]");
        const worker = list.locator("[data-own-agent^='worker-u']").first();

        await worker.waitFor({ timeout: 30_000 });

        // Nothing runs off the side of the section.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

        expect(overflow).toBeLessThanOrEqual(0);

        // The worker seat stands as received from the organisation, on the road it supplies; the role the organisation
        // turned off says so, named by who decided it.
        await expect(worker.locator("[data-own-agent-road]").textContent()).resolves.toContain("Claude Code · claude-opus-5-5 · high");
        await expect(worker.locator("[data-own-agent-origin]").textContent()).resolves.toBe(wording("own_agents.label.from_unit_unnamed"));
        await expect(list.locator("[data-own-role-off='producer']").textContent()).resolves.toContain(wording("own_agents.label.role_off"));
        await expect(worker.locator("[data-own-agent-back]").count()).resolves.toBe(0);

        // A road the reader's supply does not carry stands disabled in the road's form; one it carries is saved, and
        // the seat becomes the reader's own change.
        await press(page, worker.locator("[data-own-agent-road-change]"), phone);

        const dialog = page.locator("[data-road-dialog]");

        await dialog.waitFor({ timeout: 10_000 });
        await pick(page, dialog.locator("[data-road-dialog-provider] button, button[data-road-dialog-provider]").first(), "DeepSeek", phone);
        await press(page, dialog.locator("[data-road-dialog-model] button, button[data-road-dialog-model]").first(), phone);

        const flash = page.getByRole("option", { name: /deepseek-flash/ }).first();

        await flash.waitFor({ timeout: 10_000 });
        // Disabled as the list marks a choice no hand may pick.
        await expect(flash.evaluate((element) => element.hasAttribute("data-disabled") || element.getAttribute("aria-disabled") === "true")).resolves.toBe(true);
        await expect(flash.textContent()).resolves.toContain(wording("own_agents.label.not_supplied"));

        const pro = page.getByRole("option", { name: /deepseek-v4-pro/ }).first();

        if (phone) await pro.tap();
        else await pro.click();
        await press(page, page.locator("[data-road-dialog-save]"), phone);
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        await page.waitForFunction(() => document.querySelector("[data-own-agent^='worker-u'] [data-own-agent-road]")?.textContent?.includes("DeepSeek") === true, undefined, { timeout: 10_000 });
        await expect(worker.locator("[data-own-agent-origin]").textContent()).resolves.toBe(wording("own_agents.label.changed"));

        // The way back puts the seat back as supplied.
        await press(page, worker.locator("[data-own-agent-back]"), phone);
        await page.waitForFunction(() => document.querySelector("[data-own-agent^='worker-u'] [data-own-agent-road]")?.textContent?.includes("claude-opus-5-5") === true, undefined, { timeout: 10_000 });
        await expect(worker.locator("[data-own-agent-back]").count()).resolves.toBe(0);

        // A supplied agent switched off is the reader's own change, and switched on again it stands as supplied.
        await press(page, worker.locator("[data-own-agent-switch]"), phone);
        await page.waitForFunction(() => document.querySelector("[data-own-agent^='worker-u'] [data-own-agent-back]") !== null, undefined, { timeout: 10_000 });
        await press(page, worker.locator("[data-own-agent-switch]"), phone);
        await page.waitForFunction(() => document.querySelector("[data-own-agent^='worker-u'] [data-own-agent-back]") === null, undefined, { timeout: 10_000 });

        // An agent added to a role stands as the reader's own, with its delete.
        const before = await list.locator("[data-own-agent]").count();

        await press(page, list.locator("[data-own-agent-add]"), phone);

        const builder = page.getByRole("menuitem", { name: "Builder" });

        await builder.waitFor({ timeout: 10_000 });
        if (phone) await builder.tap();
        else await builder.click();
        await page.waitForFunction((count) => document.querySelectorAll("[data-own-agents-list] [data-own-agent]").length === count + 1, before, { timeout: 10_000 });

        const added = list.locator("[data-own-agent^='builder-u']").last();

        await expect(added.locator("[data-own-agent-origin]").textContent()).resolves.toBe(wording("own_agents.label.own"));
        await expect(added.locator("[data-own-agent-remove]").count()).resolves.toBe(1);

        // The organisation's instructions read only, and the reader's own withheld with who decided it.
        const organisation = page.locator("[data-own-org-instructions]");

        await expect(organisation.textContent()).resolves.toContain("Never share a customer's files outside the company.");

        const own = page.locator("[data-own-instructions]");

        await expect(own.locator("[data-own-instructions-decided]").textContent()).resolves.toContain(wording("org_agents.label.decided_unit"));
        await expect(own.locator("[data-own-instruction='all'] [data-own-instruction-change]").isDisabled()).resolves.toBe(true);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`gives an agent the reader's skills and keeps a group its line takes none of off, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      // The worker seat the agency's stand-in supplies, by its name, as the section reads it.
      const own = (await (await context.request.get(`${origin}/api/account/own-agents`)).json()) as { roles: { agents: { name: string }[] }[] };
      const worker = own.roles.flatMap((role) => role.agents).find((agent) => agent.name.startsWith("worker-u"))!.name;
      const holder: AttachmentHolder = { kind: "agent", name: worker, label: null, role: "worker", line: "worker", takes: { skills: true, mcp: false }, skills: ["notes"], mcp: [] };
      const listed: Attachments = {
        holders: [holder],
        skills: [
          { name: "notes", title: "Notes", titles: {}, origin: "own" },
          { name: "review-steps", title: null, titles: {}, origin: "installed" }
        ],
        mcp: [{ name: "tickets", title: "Tickets", titles: {}, origin: "installed" }]
      };
      const written: unknown[] = [];
      let refuse = true;

      await context.route(/\/api\/account\/attachments(?:\/|$|\?)/, async (route) => {
        const request = route.request();

        if (request.method() === "GET") return await route.fulfill({ json: listed });

        written.push({ path: new URL(request.url()).pathname.replace(/^.*\/api\/account\/attachments/, ""), body: request.postDataJSON() });

        // The first save is refused as the console answers the agency's refusal; the second goes through.
        if (refuse) {
          refuse = false;

          return await route.fulfill({ status: 409, json: { statusCode: 409, message: wording("attachments.error.takes_no_mcp") } });
        }

        await route.fulfill({ json: { ...holder, ...(request.postDataJSON() as object) } });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?company=me&tab=agents`, { waitUntil: "load" });

        const row = page.locator(`[data-own-agents-list] [data-own-agent='${worker}']`);

        await row.locator("[data-own-attachments]").waitFor({ timeout: 30_000 });
        await press(page, row.locator("[data-own-attachments]"), phone);

        const form = page.locator("[data-attachments-form]");
        const skills = form.locator("[data-attachments-group='skills']");
        const mcp = form.locator("[data-attachments-group='mcp']");

        await form.waitFor({ timeout: 10_000 });

        // The MCP group stands disabled, saying the agent's line takes none; the skills group holds what is given.
        await expect(mcp.locator("[data-attachments-takes-none]").textContent()).resolves.toBe(wording("attachments.label.takes_no_mcp"));
        await expect(mcp.getByRole("checkbox", { name: "Tickets" }).isDisabled()).resolves.toBe(true);
        await expect(skills.getByRole("checkbox", { name: "Notes" }).getAttribute("aria-checked")).resolves.toBe("true");
        await expect(skills.getByRole("checkbox", { name: "review-steps" }).getAttribute("aria-checked")).resolves.toBe("false");
        await expect(form.locator("[data-attachments-takes-none]").count()).resolves.toBe(1);

        // Nothing changed, nothing to save; a skill checked opens the save.
        await expect(page.locator("[data-attachments-save]").isDisabled()).resolves.toBe(true);
        await press(page, skills.getByRole("checkbox", { name: "review-steps" }), phone);
        await press(page, page.locator("[data-attachments-save]"), phone);

        // The refusal stands in the form with the choice kept; the save again goes through and closes it.
        await expect(form.locator("[data-attachments-refusal]").textContent()).resolves.toBe(wording("attachments.error.takes_no_mcp"));
        await expect(skills.getByRole("checkbox", { name: "review-steps" }).getAttribute("aria-checked")).resolves.toBe("true");
        await press(page, page.locator("[data-attachments-save]"), phone);
        await form.waitFor({ state: "detached", timeout: 10_000 });
        expect(written).toEqual([
          { path: `/agent/${worker}`, body: { skills: ["notes", "review-steps"], mcp: [] } },
          { path: `/agent/${worker}`, body: { skills: ["notes", "review-steps"], mcp: [] } }
        ]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
