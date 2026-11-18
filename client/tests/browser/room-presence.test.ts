import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// Who is here and who writes, as a room draws them (docs/web.md, 「Presence and typing」): the dot on the head's
// picture and on the room's row, the mark on the row of a room not open, and the room's typing picture naming who
// writes by their faces, collapsing past three into a count, each standing with nothing else moving and covering
// neither the box nor the newest line, at a desk's width and a phone's, and fading only where motion is welcome.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the stream and the room's members through the page's own routes: one stream holds nobody, one a person online and
// writing in the room, one five people writing, and each measure is taken under each.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-presence", password: "fixture-password-3124" };
// A group room of the harness, and another the sidebar lists beside it; the owner's own chat stands no typing picture,
// since nobody else writes there.
const CHAT = 44;
const OTHER_CHAT = 45;
const PEOPLE = [7701, 7702, 7703, 7704, 7705].map((person, at) => ({ person, name: `agent-${"bcdef"[at]}` }));
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

type Writing = "nobody" | "one" | "five";

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

function frame(event: Record<string, unknown>): string {
  return `event: bot\ndata: ${JSON.stringify(event)}\n\n`;
}

const whoOf = (person: number) => ({ kind: "person", via: "chat-a", personId: person });

// The stream as the console hands it: its run, then what stands of the present; whoever writes in the room writes in
// the other room as well, whose row in the sidebar carries the mark.
function stream(writing: Writing): string {
  const run = `event: run\ndata: ${JSON.stringify({ run: "presence-run" })}\n\n`;
  const writers = writing === "nobody" ? [] : PEOPLE.slice(0, writing === "one" ? 1 : PEOPLE.length);

  if (writers.length === 0) return run;

  return (
    run +
    frame({ id: null, at: 1, type: "presence", chatId: CHAT, messageId: null, who: whoOf(PEOPLE[0]!.person), state: "online", lastSeenAt: null }) +
    writers
      .flatMap(({ person }) => [CHAT, OTHER_CHAT].map((chatId) => frame({ id: null, at: 1, type: "typing", chatId, messageId: null, who: whoOf(person), on: true, lastsMs: null })))
      .join("")
  );
}

async function open(
  viewport: (typeof WIDTHS)[number],
  writing: Writing,
  motion: "reduce" | "no-preference" = "reduce",
  // What the room's members read waits for before it answers.
  membersHeld: Promise<void> = Promise.resolve()
): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: motion
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  // The stream is served once; the tab's next open is left waiting, so it never drops what the first one handed and
  // the marks stand still while they are measured.
  let served = false;

  await context.route(/\/api\/events(\?|$)/, async (route) => {
    if (served) return;

    served = true;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: stream(writing) });
  });
  await context.route(new RegExp(`/api/rooms/${CHAT}/members$`), async (route) => {
    await membersHeld;
    await route.fulfill({ json: { members: PEOPLE.map(({ person, name }) => ({ person, name, status: null, account: null, inConsole: false })), mayLetIn: false } });
  });
  // The moment the picture first stands, what its transition is, read before any frame of it is drawn.
  await context.addInitScript(() => {
    new MutationObserver((_, observer) => {
      const picture = document.querySelector<HTMLElement>("[data-typing-picture]");

      if (picture === null || picture.style.display === "none") return;

      Reflect.set(window, "pictureTransition", getComputedStyle(picture).transitionProperty);
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
  });

  return context;
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Drawn {
  band: Box;
  foot: Box;
  newest: Box;
  picture: Box | null;
  label: string | null;
  said: string;
  faces: string[];
  menuLeft: number;
  headDot: boolean;
}

async function drawn(page: Page): Promise<Drawn> {
  return await page.evaluate(() => {
    const box = (element: Element): Box => {
      const { top, bottom, left, right } = element.getBoundingClientRect();

      return { top, bottom, left, right };
    };
    const band = document.querySelector<HTMLElement>("[data-typing-band]")!;
    const foot = document.querySelector<HTMLElement>("[data-screen-foot]:not([data-typing-band])")!;
    const newest = [...document.querySelectorAll<HTMLElement>("[data-message]")].at(-1)!;
    const standing = document.querySelector<HTMLElement>("[data-typing-picture]");
    const picture = standing === null || getComputedStyle(standing).display === "none" ? null : standing;
    const menu = document.querySelector<HTMLElement>("[data-room-menu]")!;
    const bar = menu.closest<HTMLElement>("[data-title-bar]")!;

    return {
      band: box(band),
      foot: box(foot),
      newest: box(newest),
      picture: picture === null ? null : box(picture),
      label: picture?.getAttribute("aria-label") ?? null,
      said: (document.querySelector("[data-typing-said]")?.textContent ?? "").trim(),
      faces: [...(picture?.querySelectorAll("[data-typing-faces] > *") ?? [])].map((face) => (face.textContent ?? "").trim()),
      menuLeft: menu.getBoundingClientRect().left,
      headDot: bar.querySelector(".bg-success") !== null
    };
  });
}

async function visit(context: BrowserContext, writing: Writing): Promise<{ page: Page; drawn: Drawn }> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "networkidle" });
  await page.locator("[data-typing-band]").waitFor();
  await page.locator("[data-message]").first().waitFor();

  if (writing !== "nobody") await page.locator("[data-typing-picture]").waitFor();

  // The conversation is read at its end, where its newest line stands over the band, whatever place it opened at.
  await page.evaluate(
    async () =>
      await new Promise<void>((settled) => {
        let at: HTMLElement | null = document.querySelector("[data-message]");

        while (at !== null && !/(auto|scroll)/.test(getComputedStyle(at).overflowY)) at = at.parentElement;
        at?.scrollTo({ top: at.scrollHeight, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(() => settled()));
      })
  );

  return { page, drawn: await drawn(page) };
}

const names = (count: number): string => PEOPLE.slice(0, count).map(({ name }) => name).join(", ");
const said = (count: number): string => wording("room.label.typing_names", { names: names(count) });

describe.skipIf(!origin || !touchReady())("who is here and who writes in a room", () => {
  for (const viewport of WIDTHS) {
    test(`the typing picture names who writes, collapses past three, and stands with nothing else moving, ${viewport.width}px`, async () => {
      const contexts = await Promise.all((["nobody", "one", "five"] as const).map(async (writing) => await open(viewport, writing)));

      try {
        const [quiet, one, five] = await Promise.all(contexts.map(async (context, at) => await visit(context, (["nobody", "one", "five"] as const)[at]!)));

        expect(quiet!.drawn.picture).toBeNull();
        expect(quiet!.drawn.said).toBe("");
        expect(quiet!.drawn.headDot).toBe(false);

        expect(one!.drawn.faces).toHaveLength(1);
        expect(one!.drawn.label).toBe(said(1));
        expect(one!.drawn.said).toBe(one!.drawn.label!);
        expect(one!.drawn.headDot).toBe(true);

        // Five writers stand as three faces and a count of the other two, and every one of them is named.
        expect(five!.drawn.faces).toHaveLength(4);
        expect(five!.drawn.faces).toContain("+2");
        expect(five!.drawn.label).toBe(said(5));

        for (const busy of [one!, five!]) {
          const picture = busy.drawn.picture!;

          // Nothing moves as the picture comes, and it stands inside its band, clear of the box and the newest line.
          expect(busy.drawn.band).toEqual(quiet!.drawn.band);
          expect(busy.drawn.foot).toEqual(quiet!.drawn.foot);
          expect(busy.drawn.newest).toEqual(quiet!.drawn.newest);
          expect(busy.drawn.menuLeft).toBe(quiet!.drawn.menuLeft);
          expect(picture.top).toBeGreaterThanOrEqual(busy.drawn.band.top);
          expect(picture.bottom).toBeLessThanOrEqual(busy.drawn.foot.top);
          expect(picture.top).toBeGreaterThanOrEqual(busy.drawn.newest.bottom);
          expect(picture.right).toBeLessThanOrEqual(viewport.width);
        }

        // The names are read in the tooltip too: a pointer brings it up on a desk, a tap on a phone.
        const shown = five!.page.locator("[data-typing-tip]");

        if (viewport.phone) await shown.tap();
        else await shown.hover();

        expect(await five!.page.locator('[role="tooltip"]').first().innerText({ timeout: 5_000 })).toBe(said(5));
      } finally {
        await Promise.all(contexts.map(async (context) => await context.close()));
      }
    }, BROWSER_HOOK_MS);
  }

  for (const viewport of WIDTHS) {
    test(`the head's dot answers the pointer and opens the room's people with their presence, ${viewport.width}px`, async () => {
      const context = await open(viewport, "one");

      try {
        const page = await context.newPage();
        const dot = page.locator("[data-room-presence]");
        const colour = async (): Promise<string> => await dot.evaluate((element) => getComputedStyle(element).backgroundColor);

        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "networkidle" });
        await dot.waitFor();

        const rest = await colour();

        if (!viewport.phone) {
          await dot.hover();
          expect(await colour()).not.toBe(rest);
        }

        // The press reaches past the dot, so a finger finds it.
        const box = (await dot.evaluate((element) => {
          const before = getComputedStyle(element, "::before");

          return { inset: before.top };
        })) as { inset: string };

        expect(box.inset).toBe("-8px");

        await dot.click();
        await page.locator("[data-member-presence]").waitFor();
        expect((await page.locator("[data-member-presence]").textContent())?.trim()).not.toBe("");
      } finally {
        await context.close();
      }
    }, BROWSER_HOOK_MS);
  }

  test("the account's switch turns its presence off and on again, kept as it is switched", async () => {
    const context = await open(WIDTHS[0], "nobody");

    try {
      const page = await context.newPage();
      const shown = async (): Promise<boolean> => ((await (await page.request.get(`${origin}/api/account/presence`)).json()) as { shown: boolean }).shown;

      // The account starts shown whatever an earlier run left.
      expect((await page.request.put(`${origin}/api/account/presence`, { data: { shown: true } })).ok()).toBe(true);
      await page.goto(`${origin}/?settings=account`, { waitUntil: "networkidle" });

      const toggle = page.locator("[data-presence-row] [role=switch]");

      await toggle.waitFor();
      expect(await toggle.getAttribute("aria-checked")).toBe("true");
      expect(await shown()).toBe(true);

      // The switch takes the state the console answered with, so it turns once the change is kept.
      await toggle.click();
      await page.locator("[data-presence-row] [role=switch][aria-checked=false]").waitFor();
      expect(await shown()).toBe(false);

      await toggle.click();
      await page.locator("[data-presence-row] [role=switch][aria-checked=true]").waitFor();
      expect(await shown()).toBe(true);
    } finally {
      await context.close();
    }
  }, BROWSER_HOOK_MS);

  test("a writer joins the picture once the read naming them has ended, never drawn unnamed meanwhile", async () => {
    let answer = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const context = await open(WIDTHS[1], "one", "reduce", held);

    try {
      const page = await context.newPage();
      const asked = page.waitForRequest(new RegExp(`/api/rooms/${CHAT}/members$`));

      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
      await page.locator("[data-typing-band]").waitFor();
      await asked;

      expect(await page.locator("[data-typing-picture]").isVisible()).toBe(false);
      expect((await page.locator("[data-typing-said]").textContent())?.trim()).toBe("");

      answer();
      await page.locator("[data-typing-picture]").waitFor();
      expect(await page.locator("[data-typing-picture]").getAttribute("aria-label")).toBe(said(1));
    } finally {
      answer();
      await context.close();
    }
  }, BROWSER_HOOK_MS);

  test("the sidebar marks a room not open while the open room's own row says nothing, and the picture fades where motion is welcome", async () => {
    const welcome = await open(WIDTHS[0], "one", "no-preference");
    const still = await open(WIDTHS[0], "one");

    try {
      const { page } = await visit(welcome, "one");

      expect(await page.locator(`a[href$="/rooms/${OTHER_CHAT}"] [data-room-typing]`).count()).toBeGreaterThan(0);
      expect(await page.locator(`a[href$="/rooms/${CHAT}"] [data-room-typing]`).count()).toBe(0);
      expect(await page.evaluate(() => Reflect.get(window, "pictureTransition"))).toBe("opacity");

      const { page: stillPage } = await visit(still, "one");

      expect(await stillPage.evaluate(() => Reflect.get(window, "pictureTransition"))).toBe("none");
    } finally {
      await welcome.close();
      await still.close();
    }
  }, BROWSER_HOOK_MS);
});
