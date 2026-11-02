import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { catalogueEntry } from "../support/catalogue";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { AgentList, AgentSummary } from "../../apps/web/shared/types";

// An @ in a room offers its agents by the agents' own names and pictures (docs/web.md, the room screen's mention
// section): the names come from the receiver's answerers and what each is called from the agents catalogue, never from
// a room's title — a chat session registered for one room carries that room's title, and the agent answering there is
// not that room.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the room's answerers and the catalogue through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "mention-agents", password: "fixture-password-2346" };
const CHAT = -9_000_000_000_099;
const ROOM_TITLE = "record-room";

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

async function open(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  // The room answers with a default answerer and one companion, each a supervisor holding a session in the room; the
  // room's title is no agent's name.
  await context.route(new RegExp(`/api/rooms/${CHAT}/answerers$`), (route) =>
    route.fulfill({ json: { default: "agent-a", voice: null, agents: [{ name: "agent-a", companion: false }, { name: "agent-b", companion: true }] } })
  );
  await context.route(/\/api\/agents(\?|$)/, async (route) => {
    const list = (await (await route.fetch()).json()) as AgentList;
    const named = (name: string, label: string, extra: Partial<AgentSummary>) => catalogueEntry(name, "supervisor", label, { sessionScope: "room", turnShape: "pieces", ...extra });

    await route.fulfill({
      json: {
        ...list,
        agents: [
          ...list.agents.filter((agent) => agent.name !== `chat:${CHAT}` && agent.name !== "agent-b"),
          named("agent-a", "Agent A", { defaultAnswerer: true, sessionScope: "agent", turnShape: "window", sessions: [{ chatId: CHAT, lastAt: null }] }),
          named("agent-b", "Agent B", { sessions: [{ chatId: CHAT, lastAt: null }] })
        ]
      }
    });
  });

  return context;
}

// The names the list offers after an @.
async function offered(page: Page): Promise<string[]> {
  const box = page.locator("textarea").first();

  await box.click();
  await box.type("@", { delay: 40 });
  await page.locator("[data-mentions]").waitFor({ timeout: 30_000 });

  const names = await page.locator("[data-mentions] [role='option'] [data-mention-name]").allInnerTexts();

  return names.map((name) => name.trim());
}

describe.skipIf(!origin || !touchReady())("the agents an @ offers", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`are called by their own names, not the room's, at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("textarea").first().waitFor({ timeout: 30_000 });
        // The room settles before the box is used, as a reader finds it.
        await page.waitForTimeout(2_500);

        const names = await offered(page);

        expect(names.slice(0, 2)).toEqual(["Agent A", "Agent B"]);
        expect(names).not.toContain(ROOM_TITLE);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
