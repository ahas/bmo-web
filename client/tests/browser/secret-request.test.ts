import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";
import type { SecretField, SecretKind, SecretKindList } from "../../apps/web/shared/secret-kinds";
import type { ArchivedMessage, MessagePage, SecretList, TelegramFormat } from "../../apps/web/shared/types";

// A secret handed to an agent (docs/web.md, 「Settings」, the secret store section): the clip offering it in a room's box
// and a worker's, the form asking it in every kind the server seeds, a request link pressed in place, a request
// arriving that opens the form once by itself, a link pressed in Telegram reaching the form through the login, and a
// request answered by the reader it is for alone. No value stands in any request but the
// store's write, nor in the browser's storage. The room is a fixture this test serves through the page's own routes;
// the console around it, with the account service and its secret store on a scratch folder, is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up. The suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "secret-request", password: "fixture-password-2649" };
const MEMBER = { name: "room-writer", password: "fixture-password-2401" };
const CHAT = -100_000_002_649;
// The repository the stand-in console lists, whose worker's screen carries a box with a clip.
const REPOSITORY = "repo-a";
const AGENT = 777_002;
// Every value typed here carries this mark, so a value standing anywhere it must not is found by it.
const MARK = "sv-2649-";
// The harness's store stands across runs, so each run's names are its own.
const RUN = Date.now().toString(36);
const TEST_MS = 180_000;

let browser: Browser | null = null;
let cookie = "";
let memberCookie = "";
let owner = 0;

async function signIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookie = await signIn(ACCOUNT);
  memberCookie = await signIn(MEMBER);
  owner = ((await (await fetch(`${origin}/api/owner`, { headers: { cookie } })).json()) as { chatId: number | null }).chatId ?? 1;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The room's line, and every word the screen sent into it.
class Room {
  readonly rows: ArchivedMessage[] = [];
  readonly said: string[] = [];
  private next = 9_000;
  private clock = Math.floor(Date.now() / 1000) - 600;

  say(text: string, mine: boolean, formats?: TelegramFormat[]): ArchivedMessage {
    this.clock += 5;

    const row: ArchivedMessage = {
      ...(formats === undefined ? {} : { formats }),
      chatId: CHAT,
      messageId: String(this.next++),
      senderId: mine ? owner : AGENT,
      senderName: mine ? ACCOUNT.name : "agent-a",
      sentAt: this.clock,
      text,
      imagePath: null,
      replyToMessageId: null
    };

    this.rows.push(row);

    return row;
  }

  page(query: URLSearchParams): MessagePage {
    if (query.has("after")) {
      const from = this.rows.findIndex((row) => row.messageId === query.get("after")) + 1;

      return { messages: this.rows.slice(from), judgements: [], hasMore: false };
    }

    return { messages: this.rows, judgements: [], hasMore: false };
  }
}

// What went out of the page: each request's address and body.
interface Sent {
  method: string;
  url: string;
  body: string;
}

// A browser opened on the room, signed in as the account given, or holding no login where none is.
async function open(room: Room, sent: Sent[], viewport: { width: number; height: number; phone: boolean }, account: string | null = cookie): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  if (account !== null) {
    const at = account.indexOf("=");

    await context.addCookies([{ name: account.slice(0, at), value: account.slice(at + 1), url: origin! }]);
  }

  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: owner } }));
  // Each connection names the bot's run and ends; the next one is the stream coming back, which the room answers by
  // reading its end, so a row added to the fixture arrives as a new message does.
  await context.route(/\/api\/events(\?|$)/, (route) =>
    route.fulfill({ contentType: "text/event-stream", body: `retry: 500\n\nevent: run\ndata: {"run":"fixture"}\n\n` })
  );
  await context.route(/\/api\/rooms$/, (route) =>
    route.fulfill({ json: [{ chatId: CHAT, title: "secret room", messageCount: room.rows.length, lastMessageAt: room.rows.at(-1)?.sentAt ?? null, unread: 0, firstUnread: null, readTo: null }] })
  );
  await context.route(new RegExp(`/api/rooms/${CHAT}/`), (route) => answerRoom(route, room));
  context.on("request", (request) => sent.push({ method: request.method(), url: request.url(), body: request.postData() ?? "" }));

  return context;
}

async function answerRoom(route: Route, room: Room): Promise<void> {
  const url = new URL(route.request().url());

  if (url.pathname.endsWith("/messages")) {
    await route.fulfill({ json: room.page(url.searchParams) });
  } else if (url.pathname.endsWith("/read")) {
    await route.fulfill({ json: { unread: 0, firstUnread: null, readTo: null } });
  } else if (url.pathname.endsWith("/say")) {
    const body = route.request().postDataJSON() as { text: string };

    room.said.push(body.text);
    await route.fulfill({ json: { messageId: room.say(body.text, true).messageId } });
  } else {
    await route.fulfill({ status: 404, json: { message: "no such fixture" } });
  }
}

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await hydrated(page);
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
}

// The page has taken over what the server drew, so what is typed into it stays.
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

    return root?.__vue_app__?.$nuxt?.isHydrating === false;
  });
}

// A request link to this room, as an agent writes it.
function requestLink(query: string): string {
  return `${origin}/rooms/${CHAT}?${query}`;
}

// No value stands in any request but the store's write, nor in the browser's storage.
async function expectNoValueOutside(page: Page, sent: readonly Sent[]): Promise<void> {
  const stray = sent.filter((one) => (one.url.includes(MARK) || one.body.includes(MARK)) && !(one.method === "POST" && new URL(one.url).pathname.endsWith("/api/secrets")));

  expect(stray.map((one) => `${one.method} ${one.url}`)).toEqual([]);
  expect(sent.some((one) => one.url.includes(MARK))).toBe(false);

  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, href: location.href }));

  expect(stored).not.toContain(MARK);
}

async function kept(): Promise<SecretList["secrets"]> {
  return ((await (await fetch(`${origin}/api/secrets`, { headers: { cookie } })).json()) as SecretList).secrets;
}

// A value for each field: the kind's file is then these, joined as the form writes them.
function valueOf(kind: SecretKind, field: SecretField): string {
  return field.input === "lines" ? `${MARK}${kind.key}\nline two\n` : `${MARK}${kind.key}-${field.key.toLowerCase()}`;
}

const FILE_BYTES = Buffer.from([0, 255, 128, 10, 0x73, 0x76]);

function fileBytes(kind: SecretKind): number {
  if (kind.fields.length === 1) {
    const field = kind.fields[0]!;

    return field.input === "file" ? FILE_BYTES.length : Buffer.byteLength(valueOf(kind, field));
  }

  return Buffer.byteLength(kind.fields.map((field) => `${field.key}=${valueOf(kind, field)}\n`).join(""));
}

async function fillFields(page: Page, kind: SecretKind): Promise<void> {
  for (const field of kind.fields) {
    const box = page.locator(`[data-secret-field="${field.key}"]`);

    if (field.input === "file") {
      await box.locator("[data-secret-file-picker]").setInputFiles({ name: "service.json", mimeType: "application/octet-stream", buffer: FILE_BYTES });
    } else {
      await box.locator(field.input === "lines" ? "textarea" : "input").first().fill(valueOf(kind, field));
    }

    if (field.input === "line") {
      expect(await box.locator("input").first().getAttribute("type")).toBe(field.masked ? "password" : "text");
    }
  }
}

async function chooseKind(page: Page, name: string): Promise<void> {
  await page.locator("[data-secret-kind]").click();
  await page.getByRole("option", { name, exact: true }).click();
  // The list closes on the choice, so what is typed next goes to the form rather than to the list's search.
  await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
}

async function clipMenu(page: Page): Promise<string[]> {
  await page.locator(`button[aria-label="${wording("room.action.attach_file")}"]`).first().click();

  const items = page.getByRole("menuitem");

  await items.first().waitFor({ timeout: 10_000 });

  return (await items.allInnerTexts()).map((text) => text.trim());
}

describe.skipIf(!origin || !touchReady())("a secret handed to an agent", () => {
  test("the clip offers it beside the files in a room's box and a worker's, on a touch screen and with a mouse", async () => {
    const room = new Room();
    const sent: Sent[] = [];

    room.say("hello", false);

    for (const viewport of [{ width: 1280, height: 900, phone: false }, { width: 360, height: 780, phone: true }]) {
      const context = await open(room, sent, viewport);

      try {
        const page = await context.newPage();

        await visit(page, `/rooms/${CHAT}`);

        const expected = viewport.phone
          ? [wording("room.action.attach_media"), wording("room.action.attach_document"), wording("room.action.attach_secret")]
          : [wording("room.action.attach_document"), wording("room.action.attach_secret")];

        expect(await clipMenu(page)).toEqual(expected);

        await page.keyboard.press("Escape");
        await visit(page, `/agents/${REPOSITORY}`);
        expect(await clipMenu(page)).toEqual(expected);
      } finally {
        await context.close();
      }
    }
  }, TEST_MS);

  test("every seeded kind writes its file, the chips go in as names alone, and no value goes anywhere else", async () => {
    const kinds = ((await (await fetch(`${origin}/api/secret-kinds`, { headers: { cookie } })).json()) as SecretKindList).kinds;
    const room = new Room();
    const sent: Sent[] = [];

    expect(kinds.map((kind) => kind.key)).toEqual(["api-key", "account-login", "aws-access-key", "oauth-client", "database", "ssh-private-key", "file", "card", "delivery-address"]);
    room.say("hello", false);

    const context = await open(room, sent, { width: 1280, height: 900, phone: false });

    try {
      const page = await context.newPage();

      await visit(page, `/rooms/${CHAT}`);

      for (const kind of kinds) {
        await clipMenu(page);
        await page.getByRole("menuitem", { name: wording("room.action.attach_secret") }).click();
        await page.locator("[data-secret-form]").waitFor({ timeout: 10_000 });
        await chooseKind(page, kind.name);
        await page.locator("[data-secret-name]").fill(`kind-${RUN}-${kind.key}`);
        await fillFields(page, kind);
        await page.locator("[data-secret-save]").click();
        await page.locator("[data-secret-form]").waitFor({ state: "detached", timeout: 10_000 });
      }

      expect(await page.locator("[data-handed-secret]").count()).toBe(kinds.length);

      const store = await kept();

      for (const kind of kinds) {
        expect(store.find((one) => one.name === `kind-${RUN}-${kind.key}`)?.bytes).toBe(fileBytes(kind));
      }

      await page.locator("form [type='submit']").first().click();
      await page.locator("[data-handed-secret]").first().waitFor({ state: "detached", timeout: 10_000 });

      const lines = kinds.map((kind) => wording("secrets.message.handed", { name: `kind-${RUN}-${kind.key}`, kind: kind.name })).join("\n");

      expect(await until(() => room.said.length > 0)).toBe(true);
      expect(room.said).toEqual([lines]);
      await expectNoValueOutside(page, sent);
      await page.screenshot({ path: "/tmp/secret-request-chips.png" });
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("a request link opens the form in place, and a save answers the room and reads as saved", async () => {
    const room = new Room();
    const sent: Sent[] = [];

    room.say(`Please hand me the deploy key: ${requestLink(`secret=req-${RUN}.token&kind=api-key&for=the%20deploy`)}`, false);

    const context = await open(room, sent, { width: 1280, height: 900, phone: false });

    try {
      const page = await context.newPage();

      await visit(page, `/rooms/${CHAT}`);

      const line = page.locator(`[data-secret-request="req-${RUN}.token"]`);

      await line.waitFor({ timeout: 20_000 });
      expect(await line.getAttribute("data-saved")).toBeNull();
      const waitingHeight = (await line.boundingBox())!.height;
      await page.screenshot({ path: "/tmp/secret-request-line.png" });

      const before = page.url();

      await page.locator(`[data-words] a[href*="secret=req-${RUN}.token"]`).first().click();
      await page.locator("[data-secret-form]").waitFor({ timeout: 10_000 });
      expect(page.url()).toBe(before);
      expect(context.pages().length).toBe(1);
      expect(await page.locator("[data-secret-purpose]").innerText()).toContain("the deploy");
      expect(await page.locator("[data-secret-name]").inputValue()).toBe(`req-${RUN}.token`);
      await page.screenshot({ path: "/tmp/secret-request-form.png" });

      await page.locator('[data-secret-field="API_KEY"] input').fill(`${MARK}link`);
      await page.locator("[data-secret-save]").click();
      await page.locator("[data-secret-form]").waitFor({ state: "detached", timeout: 10_000 });

      expect(await until(() => room.said.length > 0)).toBe(true);
      expect(room.said).toEqual([wording("secrets.message.request_saved", { name: `req-${RUN}.token`, kind: await kindName("api-key") })]);
      await page.locator(`[data-secret-request="req-${RUN}.token"][data-saved]`).waitFor({ timeout: 10_000 });
      // The same height to within half a pixel: the layout measures on fractional device pixels, so a
      // sub-pixel difference is the same line, not one re-laid out.
      expect(Math.abs((await line.boundingBox())!.height - waitingHeight)).toBeLessThanOrEqual(0.5);
      await expectNoValueOutside(page, sent);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("a request's card stands inside its bubble in three lines of one height at every width, while its list is read and after, and its button opens the form", async () => {
    const room = new Room();
    const sent: Sent[] = [];
    const purpose = "the house listing collector, the service key of the public data portal for every nationwide notice";
    const long = `long-${RUN}.portal`;
    const short = `short-${RUN}.portal`;

    room.say(
      [
        "The collector reads the nationwide listings from the public data portal, and it needs a service key to go on.",
        "Every other source is already wired, and the next run starts as soon as the key is stored.",
        `[Store the key](${requestLink(`secret=${long}&fields=PORTAL_DATA_SERVICE_KEY%2A&for=${encodeURIComponent(purpose)}`)})`
      ].join("\n\n"),
      false
    );
    room.say(`Key: ${requestLink(`secret=${short}&fields=PORTAL_DATA_SERVICE_KEY%2A&for=${encodeURIComponent(purpose)}`)}`, false);

    const heights: number[] = [];

    for (const viewport of [{ width: 1280, height: 900, phone: false }, { width: 360, height: 780, phone: true }]) {
      const context = await open(room, sent, viewport);
      // The reader's list is held back on the wide screen, so the cards are measured while it is read, and refused on
      // the phone, so they are measured reading why.
      let release = (): void => undefined;
      const held = new Promise<void>((done) => {
        release = done;
      });

      await context.route(/\/api\/secrets$/, async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        if (viewport.phone) return route.fulfill({ status: 500, json: { message: "fixture refusal" } });
        await held;
        await route.fallback();
      });

      try {
        const page = await context.newPage();

        await visit(page, `/rooms/${CHAT}`);

        if (!viewport.phone) {
          for (const name of [long, short]) {
            const reading = page.locator(`[data-secret-request="${name}"]`);

            await reading.locator("[data-secret-request-reading]").waitFor({ timeout: 20_000 });
            heights.push((await reading.boundingBox())!.height);
          }

          release();
        }

        for (const name of [long, short]) {
          const card = page.locator(`[data-secret-request="${name}"]`);

          await card.waitFor({ timeout: 20_000 });
          await card.locator("[data-secret-request-open]").focus();
          if (viewport.phone) expect(await card.innerText()).toContain(wording("secrets.error.read_failed"));

          // What the card stands in, measured as the browser laid it: its own box and its three rows against the
          // bubble's, and how far the focus scrolled anything between the two sideways.
          const laid = await card.evaluate((element) => {
            const bubble = element.closest<HTMLElement>("[data-bubble]")!;
            const box = (part: Element): { left: number; right: number; top: number; bottom: number } => {
              const rect = part.getBoundingClientRect();

              return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            };
            const shifted: number[] = [];

            for (let part: Element | null = element; part !== null && part !== bubble; part = part.parentElement) {
              shifted.push(part.scrollLeft);
            }

            return { bubble: box(bubble), card: box(element), rows: [...element.children].map(box), shifted };
          });

          expect(laid.card.left).toBeGreaterThanOrEqual(laid.bubble.left);
          expect(laid.card.right).toBeLessThanOrEqual(laid.bubble.right);
          expect(laid.shifted.every((step) => step === 0)).toBe(true);
          expect(laid.rows.length).toBe(3);

          for (const [at, row] of laid.rows.entries()) {
            expect(row.right).toBeLessThanOrEqual(laid.card.right);
            if (at > 0) expect(row.top).toBeGreaterThanOrEqual(laid.rows[at - 1]!.bottom);
          }

          heights.push(laid.card.bottom - laid.card.top);
        }

        await page.screenshot({ path: `/tmp/secret-request-card-${viewport.width}.png` });

        await page.locator(`[data-secret-request="${short}"] [data-secret-request-open]`).click();
        await page.locator("[data-secret-form]").waitFor({ timeout: 10_000 });
        expect(await page.locator("[data-secret-name]").inputValue()).toBe(short);
      } finally {
        await context.close();
      }
    }

    // One height across every width and every read, to within half a pixel: the layout measures on fractional
    // device pixels, so a sub-pixel difference is the same card, not one re-laid out.
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
  }, TEST_MS);

  test("a request arriving in the room open in front opens the form once by itself", async () => {
    const room = new Room();
    const sent: Sent[] = [];

    room.say("hello", false);

    const context = await open(room, sent, { width: 1280, height: 900, phone: false });

    try {
      const page = await context.newPage();

      await visit(page, `/rooms/${CHAT}`);
      await page.waitForTimeout(1_500);
      expect(await page.locator("[data-secret-form]").count()).toBe(0);

      room.say(`Two more: ${requestLink(`secret=auto-${RUN}.env&fields=SERVICE_USER,SERVICE_PASS*`)}`, false);
      await page.locator("[data-secret-form]").waitFor({ timeout: 20_000 });
      expect(await page.locator('[data-secret-field="SERVICE_USER"] input').getAttribute("type")).toBe("text");
      expect(await page.locator('[data-secret-field="SERVICE_PASS"] input').getAttribute("type")).toBe("password");

      await page.getByRole("button", { name: wording("common.action.cancel"), exact: true }).click();
      await page.locator("[data-secret-form]").waitFor({ state: "detached", timeout: 10_000 });

      // The stream comes back again and again; the same message never opens the form again, and its line stays.
      await page.waitForTimeout(3_000);
      expect(await page.locator("[data-secret-form]").count()).toBe(0);
      expect(await page.locator(`[data-secret-request="auto-${RUN}.env"]`).count()).toBe(1);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("a link pressed in Telegram opens the console through the login, with the form over the room", async () => {
    const room = new Room();
    const sent: Sent[] = [];
    const name = `tg-${RUN}.env`;
    // As Telegram carries a link behind words: the address rides on the message's formatting, not in its words, with
    // the hidden field's star written percent-encoded as a chat that formats a star writes it.
    const words = "Please hand me the service login here";
    const link = requestLink(`secret=${name}&fields=TG_USER,TG_PASS%2A&for=the%20service`);

    room.say(words, false, [{ offset: words.length - 4, length: 4, kind: "link", url: link }]);

    const context = await open(room, sent, { width: 412, height: 915, phone: true }, null);

    try {
      const page = await context.newPage();

      await page.goto(link, { waitUntil: "load" });
      await page.locator("#login-form").waitFor({ timeout: 20_000 });
      await hydrated(page);
      expect(new URL(page.url()).searchParams.get("to")).toContain(`secret=${name}`);
      await page.getByLabel(wording("app.label.user_id")).fill(ACCOUNT.name);
      await page.getByLabel(wording("app.label.password")).fill(ACCOUNT.password);
      await page.locator('button[form="login-form"]').click();

      await page.locator("[data-secret-form]").waitFor({ timeout: 30_000 });
      expect(new URL(page.url()).pathname.endsWith(`/rooms/${CHAT}`)).toBe(true);
      expect(new URL(page.url()).searchParams.has("secret")).toBe(false);
      expect(await page.locator("[data-secret-name]").inputValue()).toBe(name);
      expect(await page.locator("[data-secret-purpose]").innerText()).toContain("the service");
      expect(await page.locator('[data-secret-field="TG_PASS"] input').getAttribute("type")).toBe("password");
      await page.screenshot({ path: "/tmp/secret-request-telegram.png" });

      await page.locator('[data-secret-field="TG_USER"] input').fill(`${MARK}user`);
      await page.locator('[data-secret-field="TG_PASS"] input').fill(`${MARK}pass`);
      await page.locator("[data-secret-save]").click();
      await page.locator("[data-secret-form]").waitFor({ state: "detached", timeout: 10_000 });

      expect(await until(() => room.said.length > 0)).toBe(true);
      expect(room.said).toEqual([wording("secrets.message.request_saved", { name, kind: wording("secrets.message.composed", { keys: "TG_USER, TG_PASS" }) })]);
      // The request riding on the message's formatting stands as its line, and reads as saved.
      await page.locator(`[data-secret-request="${name}"][data-saved]`).waitFor({ timeout: 10_000 });
      await expectNoValueOutside(page, sent);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("an address opens the form and is taken off, and a member is shown it for their own request alone", async () => {
    const room = new Room();
    const sent: Sent[] = [];

    room.say("hello", false);

    const context = await open(room, sent, { width: 1280, height: 900, phone: false });

    try {
      const page = await context.newPage();

      await visit(page, `/rooms/${CHAT}?secret=addressed.env&kind=database`);
      await page.locator("[data-secret-form]").waitFor({ timeout: 20_000 });
      expect(new URL(page.url()).searchParams.has("secret")).toBe(false);
      await page.locator('[data-secret-field="DB_HOST"]').waitFor({ timeout: 10_000 });
    } finally {
      await context.close();
    }

    const member = await open(room, sent, { width: 1280, height: 900, phone: false }, memberCookie);

    try {
      const page = await member.newPage();

      await page.goto(`${origin}/rooms/${CHAT}?secret=refused.token&kind=api-key`, { waitUntil: "load" });
      await page.getByText(wording("secrets.error.not_for_you")).first().waitFor({ timeout: 20_000 });
      expect(await page.locator("[data-secret-form]").count()).toBe(0);

      const session = (await (await fetch(`${origin}/api/_auth/session`, { headers: { cookie: memberCookie } })).json()) as { user?: { id?: number } };

      await page.goto(`${origin}/rooms/${CHAT}?secret=own.token&kind=api-key&user=${session.user?.id}`, { waitUntil: "load" });
      await page.locator("[data-secret-form]").waitFor({ timeout: 20_000 });
    } finally {
      await member.close();
    }
  }, TEST_MS);
});

// Whether a condition comes to hold within the time given.
async function until(holds: () => boolean, ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms;

  while (Date.now() < end) {
    if (holds()) return true;

    await Bun.sleep(150);
  }

  return false;
}

async function kindName(key: string): Promise<string> {
  const kinds = ((await (await fetch(`${origin}/api/secret-kinds`, { headers: { cookie } })).json()) as SecretKindList).kinds;

  return kinds.find((kind) => kind.key === key)!.name;
}
