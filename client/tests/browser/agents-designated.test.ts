import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { catalogueEntry } from "../support/catalogue";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { AgentList } from "../../apps/web/shared/types";

// An agent is named by its own row's label and never by a room's title (docs/web.md, 「Sidebar」, the rule on an
// agent's own name): the chat agent stands under its own label on its screen, and so does a chat session registered for
// one room, whose own row carries that room's title; the room's title stands where a room is what is shown — the
// session under the agent in the sidebar and the room's own screen. It drives the console given in
// BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves the agent list through the
// page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agent-names", password: "fixture-password-2371" };
// The room the console's stand-in receiver holds under its own title.
const ROOM = -9_000_000_000_099;
const ROOM_TITLE = "record-room";
// The chat agent's own label, which every screen names it by.
const CHAT_LABEL = "BMO";

// What a page's title bar names the screen, once it names what is expected or the time given runs out: an agent's
// screen names it by its own name until the agent list and the chat agent's label have landed.
async function titleOf(page: Page, expected: string): Promise<string> {
  const title = page.locator('[data-title-bar] [data-slot="title"]').first();

  await title.waitFor({ timeout: 30_000 });

  return await until(async () => (await title.innerText()).trim(), (text) => text === expected);
}

// What is read once it comes to hold, or as it stands when the time given runs out.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();

  while (!holds(value) && Date.now() < end) {
    await Bun.sleep(150);
    value = await read();
  }

  return value;
}

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

// The agent list: the chat agent's own supervisor row, answering every room that names nobody with a session in the
// room, and the chat session registered for that room, whose own row carries the room's title as its label.
function catalogue(list: AgentList, chatName: string): AgentList {
  return {
    ...list,
    defaultAnswerer: chatName,
    agents: [
      ...list.agents.filter((agent) => agent.name !== chatName),
      catalogueEntry(chatName, "supervisor", CHAT_LABEL, { defaultAnswerer: true, sessionScope: "agent", turnShape: "window", sessions: [{ chatId: ROOM, lastAt: null }] }),
      catalogueEntry(`chat:${ROOM}`, "supervisor", ROOM_TITLE)
    ]
  };
}

async function open(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/agents(\?|$)/, async (route) => {
    const list = (await (await route.fetch()).json()) as AgentList;
    const chatName = list.defaultAnswerer ?? "agent-a";

    return await route.fulfill({ json: catalogue(list, chatName) });
  });
  await context.route(/\/api\/status(\?|$)/, async (route) => {
    const status = (await (await route.fetch()).json()) as Record<string, unknown> & { bot?: Record<string, unknown> };

    // The deployment's chat agent, whose own label the console names it by.
    return await route.fulfill({ json: { ...status, bot: { ...(status.bot ?? {}), agent: "agent-a", label: CHAT_LABEL } } });
  });

  return context;
}

describe.skipIf(!origin || !touchReady())("the designated agents' names", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`stand by the agent's own label, never the room's, at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        // The chat agent's own screen, and the screen of the session it keeps for one room, are both named its own.
        await page.goto(`${origin}/agents/agent-a`, { waitUntil: "domcontentloaded" });
        expect(await titleOf(page, CHAT_LABEL)).toBe(CHAT_LABEL);

        await page.goto(`${origin}/agents/${encodeURIComponent(`chat:${ROOM}`)}`, { waitUntil: "domcontentloaded" });
        expect(await titleOf(page, CHAT_LABEL)).toBe(CHAT_LABEL);

        // The room's own screen is where its title stands.
        await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "domcontentloaded" });
        expect(await titleOf(page, ROOM_TITLE)).toBe(ROOM_TITLE);

        // Wide, the sidebar stands beside the screen: the chat agent's entry is its own label, and the room it answers
        // stands under it by the room's title.
        if (width >= 1024) {
          const entry = page.locator('nav a[href$="/agents/agent-a"]').first();
          const session = page.locator(`nav a[href*="/agents/agent-a?chat=${ROOM}"]`).first();

          await session.waitFor({ timeout: 20_000 });
          expect((await entry.locator('[data-slot="linkLabel"]').innerText()).trim()).toBe(CHAT_LABEL);
          expect((await session.locator('[data-slot="linkLabel"]').innerText()).trim()).toBe(ROOM_TITLE);
        }
      } finally {
        // A status read still in flight as the test ends is let go rather than answered.
        await context.unrouteAll({ behavior: "ignoreErrors" });
        await context.close();
      }
    }, 120_000);
  }
});
