import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import KO from "../fixtures/browser/agents-designated.ko.json";

import type { Browser, BrowserContext } from "playwright-core";
import type { AgentList } from "../../apps/web/shared/types";

// The agents screen's designated branch names an agent by its own label, never by a room's title (docs/web.md, the
// agents screen's rule on an agent's own name): a chat session registered for one room carries that room's title, and the
// agent standing there is named its own. It drives the console given in BMO_CONSOLE_TEST_URL, the one
// tests/support/browser-console.ts stands up, and serves the catalogue through the page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agent-names", password: "fixture-password-2371" };
const ROOM = -9_000_000_000_099;
const ROOM_TITLE = "AHAS Lab";
// What the room calls the chat agent, beside the raw English name the deployment carries.
// The name the room calls the chat agent, which the archive keeps: a fixture, since the code files hold no Hangul.
const CHAT_LABEL = KO.chatName;

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

// The catalogue: the chat agent's own row (answering every room), and the session it keeps for one room, labeled by
// that room's title as the archive labels it.
function catalogue(list: AgentList, chatName: string): AgentList {
  const row = (name: string, label: string, extra: Record<string, unknown>) => ({
    name,
    kind: "chat",
    role: "companion",
    sessionScope: null,
    turnShape: null,
    defaultAnswerer: false,
    model: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label,
    aliases: null,
    icon: null,
    cwd: null,
    builtin: false,
    chatId: null,
    runs: 0,
    lastRunAt: null,
    lastKeepaliveAt: null,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null,
    ...extra
  });

  return {
    ...list,
    defaultAnswerer: chatName,
    agents: [
      ...list.agents.filter((agent) => agent.name !== chatName && !agent.name.startsWith("chat:")),
      row(chatName, CHAT_LABEL, { defaultAnswerer: true }),
      row(`chat:${ROOM}`, ROOM_TITLE, { chatId: ROOM, defaultAnswerer: true })
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
    return await route.fulfill({ json: { ...status, bot: { ...(status.bot ?? {}), agent: "agent-a", label: "BMO" } } });
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

        await page.screenshot({ path: `/tmp/agents-names-${width}.png` });
        expect(there).toBe(true);
        // The room's title and the raw English name stand nowhere, and the agent wears a picture.
        expect((await told()).includes(ROOM_TITLE)).toBe(false);
        expect((await told()).includes("BMO")).toBe(false);
        expect(await page.locator("#agents-title").locator("xpath=ancestor::section[1]").locator("img").count()).toBeGreaterThan(0);
        await page.screenshot({ path: `/tmp/agents-names-${width}.png` });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
