import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// Who is here and who writes, as a room draws them (docs/web.md, 「Presence and typing」): the dot on the head's
// picture and on the room's row, the mark on the row of a room not open, and the room's typing picture naming who
// writes by their faces, collapsing past three into a count, its band taking room only while it stands, covering
// neither the box nor the newest line, its faces and words on its vertical centre, at a desk's width and a phone's,
// and fading only where motion is welcome.
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

type Writing = "nobody" | "one" | "five" | "first-stops";

// How long the first writer's mark lasts where it stops by itself: long enough for the picture to stand first.
const FIRST_STOPS_MS = 4_000;

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
  if (writing === "first-stops") {
    return (
      run +
      [PEOPLE[0]!, PEOPLE[1]!]
        .map(({ person }, at) => frame({ id: null, at: 1, type: "typing", chatId: CHAT, messageId: null, who: whoOf(person), on: true, lastsMs: at === 0 ? FIRST_STOPS_MS : null }))
        .join("")
    );
  }

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
    await route.fulfill({ json: { members: PEOPLE.map(({ person, name }) => ({ person, name, status: null, account: null, inConsole: false })), chatMembers: "listed", entry: { letIn: false, takeOut: false } } });
  });
  // Every frame, each face's place and what the picture's faces and surface are drawn at, so a face going is read as it
  // moves.
  await context.addInitScript(() => {
    const ids = new WeakMap<Element, number>();
    const samples: { faces: { id: number; left: number; opacity: number }[]; width: number }[] = [];
    let next = 0;

    Reflect.set(window, "typingSamples", samples);

    const sample = (): void => {
      const picture = document.querySelector<HTMLElement>("[data-typing-picture]");

      if (picture !== null && picture.style.display !== "none") {
        const faces = [...picture.querySelectorAll("[data-typing-faces] > [data-face]")].map((face) => {
          if (!ids.has(face)) ids.set(face, next++);

          const opacity = Math.min(...[face, ...face.querySelectorAll("*")].map((part) => Number(getComputedStyle(part).opacity)));

          return { id: ids.get(face)!, left: Math.round(face.getBoundingClientRect().left * 10) / 10, opacity };
        });

        samples.push({ faces, width: Math.round(picture.getBoundingClientRect().width * 10) / 10 });
      }

      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
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
  // What a screen reader hears of the cap, the count of the rest.
  rest: string;
  // How far each face's, the cap's and the words' vertical centre stands from the picture's.
  offCentre: number[];
  // How far the first face stands inside the picture's start and inside its top.
  firstInset: { start: number; top: number } | null;
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
    const middle = (element: Element): number => {
      const { top, height } = element.getBoundingClientRect();

      return top + height / 2;
    };
    const centred = picture?.querySelectorAll("[data-typing-faces] > [data-face] > :first-child, [data-typing-faces] [data-face-cap] [aria-hidden=true], [data-typing-tip] > span");
    const first = picture?.querySelector("[data-typing-faces] > [data-face] > :first-child") ?? null;

    return {
      band: box(band),
      foot: box(foot),
      newest: box(newest),
      picture: picture === null ? null : box(picture),
      label: picture?.getAttribute("aria-label") ?? null,
      said: (document.querySelector("[data-typing-said]")?.textContent ?? "").trim(),
      faces: [...(picture?.querySelectorAll("[data-typing-faces] > :is([data-face], [data-face-cap])") ?? [])].map((face) =>
        ((face.hasAttribute("data-face-cap") ? face.querySelector("[aria-hidden=true]") : face)?.textContent ?? "").trim()
      ),
      rest: (picture?.querySelector("[data-typing-faces] [data-face-cap] .sr-only")?.textContent ?? "").trim(),
      offCentre: [...(centred ?? [])].map((element) => Math.abs(middle(element) - middle(picture!))),
      firstInset:
        first === null ? null : { start: first.getBoundingClientRect().left - picture!.getBoundingClientRect().left, top: first.getBoundingClientRect().top - picture!.getBoundingClientRect().top },
      menuLeft: menu.getBoundingClientRect().left,
      headDot: bar.querySelector(".bg-success") !== null
    };
  });
}

async function visit(context: BrowserContext, writing: Writing): Promise<{ page: Page; drawn: Drawn }> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "networkidle" });
  await page.locator("[data-typing-band]").waitFor({ state: "attached" });
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
    test(`the typing picture names who writes, collapses past three, and takes room only while it stands, ${viewport.width}px`, async () => {
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
        expect(five!.drawn.rest).toBe(wording("common.aria.others_count", { n: "2" }));
        expect(five!.drawn.label).toBe(said(5));

        for (const busy of [one!, five!]) {
          const picture = busy.drawn.picture!;

          // The band takes room only while the picture stands: the box stays where it stood, the band stands on it, and
          // the newest line keeps its step above the band as it kept it above the box. The picture stands inside its
          // band, clear of the box and the newest line.
          expect(quiet!.drawn.band.bottom - quiet!.drawn.band.top).toBe(0);
          expect(busy.drawn.band.bottom - busy.drawn.band.top).toBeGreaterThan(0);
          expect(busy.drawn.band.bottom).toBe(busy.drawn.foot.top);
          expect(busy.drawn.foot).toEqual(quiet!.drawn.foot);
          expect(Math.round(busy.drawn.band.top - busy.drawn.newest.bottom)).toBe(Math.round(quiet!.drawn.foot.top - quiet!.drawn.newest.bottom));
          expect(busy.drawn.menuLeft).toBe(quiet!.drawn.menuLeft);
          expect(picture.top).toBeGreaterThanOrEqual(busy.drawn.band.top);
          expect(picture.bottom).toBeLessThanOrEqual(busy.drawn.foot.top);
          expect(picture.top).toBeGreaterThanOrEqual(busy.drawn.newest.bottom);
          expect(picture.right).toBeLessThanOrEqual(viewport.width);

          // Every face, the cap and the words stand on the picture's vertical centre, and the first face's curve is
          // concentric with the picture's rounded start.
          expect(busy.drawn.offCentre).toHaveLength(busy.drawn.faces.length + 1);
          for (const off of busy.drawn.offCentre) expect(off).toBeLessThanOrEqual(0.5);
          expect(Math.abs(busy.drawn.firstInset!.start - busy.drawn.firstInset!.top)).toBeLessThanOrEqual(0.5);
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
      await page.locator("[data-typing-band]").waitFor({ state: "attached" });
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

describe.skipIf(!origin || !touchReady())("the typing picture's faces as writers come and go", () => {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`a writer stopping moves the face after it sideways with no fade and the picture's width follows, motion ${motion}`, async () => {
      const context = await open(WIDTHS[0], "first-stops", motion);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
        await page.locator("[data-typing-faces] [data-face]").nth(1).waitFor({ timeout: 30_000 });
        // The first writer's mark ends, its face goes, and the one after it comes to rest in its place.
        await page.waitForFunction(
          () => {
            const samples = Reflect.get(window, "typingSamples") as { faces: unknown[] }[];
            const last = samples.slice(-10);

            return last.length === 10 && last.every((one) => one.faces.length === 1);
          },
          undefined,
          { timeout: 30_000 }
        );

        const samples = (await page.evaluate(() => Reflect.get(window, "typingSamples"))) as { faces: { id: number; left: number; opacity: number }[]; width: number }[];
        const both = samples.findLastIndex((one) => one.faces.length === 2);
        const stayer = samples.at(-1)!.faces[0]!.id;
        // The face that stays slides while the one going still stands where it was, so its places and the picture's
        // widths are read over every frame from the picture's first.
        const places = new Set(samples.map((one) => one.faces.find((face) => face.id === stayer)?.left).filter((left) => left !== undefined));
        const widths = new Set(samples.map((one) => one.width));

        expect(both).toBeGreaterThanOrEqual(0);
        // The writer who stopped stood first, so the one who stays had a place to move into.
        expect(samples.find((one) => one.faces.length === 2)!.faces.map((face) => face.id).indexOf(stayer)).toBe(1);
        // Every face is drawn whole at every frame: a face comes and goes by its place alone.
        expect(samples.flatMap((one) => one.faces).every((face) => face.opacity === 1)).toBe(true);

        if (motion === "reduce") {
          // For a reader who asked for less motion, the face and the width stand at once in their new place: from the
          // last frame before the face moved, one step each.
          const first = samples.find((one) => one.faces.some((face) => face.id === stayer))!.faces.find((face) => face.id === stayer)!.left;
          const moved = samples.findIndex((one) => one.faces.some((face) => face.id === stayer && face.left !== first));

          expect(places.size).toBe(2);
          expect(new Set(samples.slice(moved - 1).map((one) => one.width)).size).toBe(2);
        } else {
          // The face slides through the places between, and the surface narrows with it.
          expect(places.size).toBeGreaterThan(2);
          expect(widths.size).toBeGreaterThan(2);
        }
      } finally {
        await context.close();
      }
    }, BROWSER_HOOK_MS);
  }
});
