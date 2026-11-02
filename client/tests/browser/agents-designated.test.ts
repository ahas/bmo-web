import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import KO from "../fixtures/browser/agents-designated.ko.json";
import { catalogueEntry } from "../support/catalogue";

import type { Browser, BrowserContext } from "playwright-core";
import type { AgentList } from "../../apps/web/shared/types";

// The agents screen's designated branch names an agent by its own label, never by a room's title (docs/web.md, the
// agents screen's rule on an agent's own name): a chat session registered for one room carries that room's title, and the
// agent standing there is named its own. It drives the console given in BMO_CONSOLE_TEST_URL, the one
// tests/support/browser-console.ts stands up, and serves the catalogue through the page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agent-names", password: "fixture-password-2371" };
const ROOM = -9_000_000_000_099;
const ROOM_TITLE = KO.roomTitle;
// The agent's own label, which every screen shows, and the name of the room it answers in (the room's title, which the
// code files hold no Hangul for, comes from the fixture).
const CHAT_LABEL = "BMO";

// Whether what is read comes to hold within the time given.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 20_000): Promise<boolean> {
  const end = Date.now() + ms;

  while (Date.now() < end) {
    if (holds(await read())) return true;

    await Bun.sleep(150);
  }

  return false;
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

// The agent list: the chat agent's own supervisor row, answering every room that names nobody, and a companion named
// the way a room's title reads, which no screen may take for the agent's name.
function catalogue(list: AgentList, chatName: string): AgentList {
  return {
    ...list,
    defaultAnswerer: chatName,
    agents: [
      ...list.agents.filter((agent) => agent.name !== chatName),
      catalogueEntry(chatName, "supervisor", CHAT_LABEL, { defaultAnswerer: true, sessionScope: "agent", turnShape: "window" })
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
  // The chat agent's own face and the picture it stands as: the row wears the picture, not a bare mark.
  await context.route(/\/api\/agent-faces(\?|$)/, (route) => route.fulfill({ json: [{ name: "agent-a", personId: 8_709_910_429 }] }));
  await context.route(/\/api\/avatars(\?|$)/, (route) => route.fulfill({ json: [{ kind: "person", id: 8_709_910_429, url: "/api/avatars/person/8709910429?v=1" }] }));

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
        await page.goto(`${origin}/agents`, { waitUntil: "domcontentloaded" });

        // The agents table, where the designated branch stands first, names the agent by its own label. On a phone the
        // general tab stacks its sections, so the table is brought into view before it is read.
        await page.locator("#agents-title").waitFor({ timeout: 30_000 });
        await page.locator("#agents-title").scrollIntoViewIfNeeded();

        const told = async () => await page.evaluate(() => document.body.innerText);

        const there = await until(async () => (await told()).includes(CHAT_LABEL), (there) => there);
        // The room's own name stands where a room is what is shown: its header keeps it.
        await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "domcontentloaded" });
        await page.locator("textarea").first().waitFor({ timeout: 30_000 });
        expect(await until(async () => await page.evaluate(() => document.body.innerText.includes("record-room")), (there) => there)).toBe(true);

        await page.screenshot({ path: `/tmp/agents-names-${width}.png` });
        expect(there).toBe(true);
        // The agent's own name stands, not the room's, and its picture stands with it.
        expect((await told()).includes(ROOM_TITLE)).toBe(false);

        // The agent's picture is the domain's own rule (tests/app/domain/agent-face.test.ts): the person picture it has,
        // a room made for it where that has none, and its letter where neither does — never nothing.
        await page.screenshot({ path: `/tmp/agents-names-${width}.png` });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
