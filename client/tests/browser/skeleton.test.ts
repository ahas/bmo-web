import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import { wording } from '../../apps/web/shared/wording';
import { touchReady } from './touch';

import type { TodoBoard, TodoItem } from '../../apps/web/shared/types';
import KO from "../fixtures/browser/skeleton.test.ko.json";

// It drives the console given in BMO_SKELETON_TEST_URL, the one tests/support/browser-console.ts stands up:
// the development server on a scratch database, with stand-ins for the units it reads and this file's fixture
// account made there (docs/checks.md, 「How the suite runs the tests」). The suite stands up no console, so
// there it skips.
const origin = process.env.BMO_SKELETON_TEST_URL;
let browser: Browser | null = null;
beforeAll(async () => { if (origin && touchReady()) browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });

// The board is typed as the screen's own, so a column added to it fails the static check here
// rather than throwing inside a render nobody is watching.
const empty: TodoBoard = {
  queue: [], pending: [], held: [], merged: [], done: [], doneTotal: 0, standingNotes: [],
  choices: { workers: [], chats: [], requesters: [] },
  standing: { queue: 0, running: 0, pending: 0, held: 0, merged: 0 },
  paused: false, deployHold: null
};

const item = (id: number, title: string): TodoItem => ({
  id, title, instruction: 'fixture instruction', brief: null, requester: 'fixture', requesterId: null, chatId: null,
  approved: true, awaitingApproval: false, recommended: false, done: false, running: false, priority: 1, status: '', model: null, agent: null, ranOn: null,
  worker: null, cowork: false, attempts: 0, progress: null, stopped: null, holding: null, waiting: null, deployWaits: false, closing: null,
  holdPending: false, orderActive: false, seconds: null, spans: [], note: null, reports: [],
  unfinished: null, unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null,
  heldReason: null, heldKind: null, mergedInto: null, mergedAt: null, mergedIntoTitle: null,
  mergedFrom: [], createdAt: 1, doneAt: null
});

// Re-reading a board that is already on the screen is announced to assistive technology and to
// nobody else, so the notice is found by its role rather than by anything a reader would see.
const refreshing = (within: Locator) => within.getByRole('status').filter({ hasText: wording('todo.status.list_refreshing') });

describe.skipIf(!origin || !touchReady())('skeletons in the isolated console', () => {
  for (const width of [1440, 390]) {
    test(`TODO initial loading, empty success and retry at ${width}px`, async () => {
      let page: Page | undefined;
      try {
        page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
        expect(login.ok).toBe(true);
        const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
        await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
        let release!: () => void;
        let response = new Promise<void>(resolve => { release = resolve; });
        let fail = false;
        await page.route('**/api/todos?**', async route => {
          await response;
          await route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { message: 'fixture failure' } : empty) });
        });
        await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        if (width < 1280) await page.getByRole('button', { name: KO.line_59, exact: true }).click();
        const skeleton = page.getByRole('status', { name: wording('todo.status.loading'), exact: true }).filter({ visible: true });
        await skeleton.waitFor();
        await page.waitForFunction((selector) => [...document.querySelectorAll('aside')].some(e => {
          const box = e.getBoundingClientRect();
          return e.querySelector(selector) && box.width > 200 && box.left >= 0 && box.right <= innerWidth + 1;
        }), KO.line_64);
        expect(await skeleton.getAttribute('aria-busy')).toBe('true');
        expect(await skeleton.locator('button,input,a').count()).toBe(0);
        const box = await skeleton.boundingBox();
        expect(box!.width).toBeLessThan(width);
        expect(await skeleton.locator('[aria-hidden="true"].h-4').first().evaluate(e => getComputedStyle(e).animationName)).toBe('none');
        release();
        await skeleton.waitFor({ state: 'hidden' });
        // A failed background refresh leaves the successful empty board mounted, with an error.
        fail = true;
        const aside = page.locator('aside').filter({ has: page.getByText('TODO', { exact: true }) }).filter({ visible: true });
        await aside.getByRole('button', { name: wording('common.action.refresh'), exact: true }).click();
        await aside.getByText('fixture failure', { exact: false }).waitFor();
        expect(await skeleton.count()).toBe(0);
        fail = false;
        // The failure carries a refresh of its own beside the panel's, and that is the one its reader presses.
        await aside.getByRole('alert').getByRole('button', { name: wording('common.action.refresh'), exact: true }).click();
        await aside.getByText('fixture failure', { exact: false }).waitFor({ state: 'hidden' });
        expect(errors).toEqual([]);
      } finally { await page?.context().close(); }
    }, 60000);
  }
});

// What the rules ask of a skeleton is answered in numbers rather than by looking: the titles and
// the frame stand from the first frame, the placeholder is the row it stands for, and nothing the
// reader is already looking at moves when the rows land.
describe.skipIf(!origin || !touchReady())('the TODO board keeps its own frame while its rows are read', () => {
  for (const width of [1440, 390]) {
    test(`titles stand, the placeholder is the row's own shape, and nothing moves at ${width}px`, async () => {
      let page: Page | undefined;
      let release = () => {};
      try {
        page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
        const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
        await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
        let hold = new Promise<void>(resolve => { release = resolve; });
        const board = { ...empty, queue: Array.from({ length: 6 }, (_, at) => item(9100 + at, `fixture row ${at}`)) };
        await page.route('**/api/todos?**', async route => { await hold; await route.fulfill({ json: board }); });
        await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        if (width < 1280) await page.getByRole('button', { name: KO.line_108, exact: true }).click();

        const aside = page.locator('aside').filter({ has: page.getByText('TODO', { exact: true }) }).filter({ visible: true });
        const skeleton = page.getByRole('status', { name: wording('todo.status.loading'), exact: true }).filter({ visible: true });
        await skeleton.waitFor();
        // On a narrow screen the panel comes up from the edge; it is measured once it has arrived.
        await page.waitForFunction((selector) => [...document.querySelectorAll('aside')].some(e => {
          const box = e.getBoundingClientRect();
          return e.querySelector(selector) && box.width > 200 && box.left >= 0 && box.right <= innerWidth + 1;
        }), KO.line_116);

        // A section's title and the panel's own controls owe nothing to the answer, so they are
        // on the screen before it comes.
        for (const title of [KO.line_121, KO.line_121_2, KO.line_121_3]) {
          await skeleton.getByText(title, { exact: true }).waitFor();
        }
        await aside.getByRole('button', { name: wording('common.action.refresh'), exact: true }).waitFor();
        await aside.getByRole('textbox', { name: KO.line_125, exact: true }).waitFor();
        expect(await skeleton.locator('button,input,a').count()).toBe(0);

        // Where the panel stands, measured at the two things that must not move.
        const anchor = aside.getByRole('textbox', { name: KO.line_129, exact: true });
        const waitingAnchor = (await anchor.boundingBox())!;
        // The first title is the one that can be held to its place: how tall a section grows is
        // the answer's own, so only what stands above the rows is promised not to move.
        const waitingTitle = (await skeleton.locator('section > p:first-child').first().boundingBox())!;
        const placeholder = (await skeleton.locator('.grid').first().boundingBox())!;

        release();
        await skeleton.waitFor({ state: 'hidden' });
        const row = aside.locator('[data-todo-id="9100"]');
        await row.waitFor();

        // The placeholder was the row it stood for: the same height, the same left edge, the
        // same width.
        const real = (await row.boundingBox())!;
        expect(Math.abs(real.height - placeholder.height)).toBeLessThanOrEqual(2);
        expect(Math.abs(real.x - placeholder.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(real.width - placeholder.width)).toBeLessThanOrEqual(1);

        // Nothing already on the screen moved when the rows landed.
        const landedAnchor = (await anchor.boundingBox())!;
        expect(Math.abs(landedAnchor.y - waitingAnchor.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(landedAnchor.x - waitingAnchor.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(landedAnchor.height - waitingAnchor.height)).toBeLessThanOrEqual(1);
        const landedTitle = (await aside.locator('section > p:first-child').first().boundingBox())!;
        expect(Math.abs(landedTitle.y - waitingTitle.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(landedTitle.x - waitingTitle.x)).toBeLessThanOrEqual(1);

        // Reading the board again keeps the rows on the screen; no placeholder comes back. The
        // second read is held too, so what the screen looks like while it runs is what is checked.
        hold = new Promise<void>(resolve => { release = resolve; });
        await aside.getByRole('button', { name: wording('common.action.refresh'), exact: true }).click();
        await refreshing(aside).waitFor({ state: 'attached' });
        expect(await row.isVisible()).toBe(true);
        expect(await page.getByRole('status', { name: wording('todo.status.loading'), exact: true }).count()).toBe(0);
        release();
        await refreshing(aside).waitFor({ state: 'detached' });
        expect(errors).toEqual([]);
      } finally { release(); await page?.context().close(); }
    }, 60000);
  }
});

// A block of figures is drawn either way: every name in it is the screen's own, so it stands while
// the figures beside it are read. The room's session figures are the one place that is a block
// rather than a list, and this is where that is held to.
describe.skipIf(!origin || !touchReady())('a block of figures stands named while its figures are read', () => {
  for (const width of [1440, 390]) {
    test(`the room's session figures at ${width}px`, async () => {
      let page: Page | undefined;
      let release = () => {};
      try {
        page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
        const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
        await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
        const rooms = await page.request.get(`${origin}/api/rooms`).then(async answer => await answer.json());
        const chatId = (Array.isArray(rooms) ? rooms[0] : rooms?.rooms?.[0])?.chatId;
        expect(typeof chatId).toBe('number');
        const hold = new Promise<void>(resolve => { release = resolve; });
        await page.route('**/api/rooms/*/stats*', async route => { await hold; await route.continue(); });
        await page.goto(`${origin}/rooms/${chatId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        await page.getByRole('button', { name: KO.line_194, exact: true }).filter({ visible: true }).first().click();
        await page.getByRole('menuitem', { name: new RegExp(KO.line_195) }).click();

        const busy = page.getByRole('status', { name: wording('room.status.session_loading'), exact: true });
        await busy.waitFor();
        for (const name of [KO.line_199, KO.line_199_2, KO.line_199_3, KO.line_199_4, KO.line_199_5]) {
          await busy.getByText(name, { exact: true }).waitFor();
        }
        expect(await busy.locator('button,input,a').count()).toBe(0);

        release();
        await busy.waitFor({ state: 'detached' });
        for (const name of [KO.line_206, KO.line_206_2]) {
          await page.getByText(name, { exact: true }).filter({ visible: true }).first().waitFor();
        }
        expect(errors).toEqual([]);
      } finally { release(); await page?.context().close(); }
    }, 60000);
  }
});

// An actual TodoPanel, with only its transport replaced. This catches old responses changing
// the board, and a refresh remounting an expanded editor, which a source-text test cannot.
describe.skipIf(!origin || !touchReady())('TODO response ownership', () => {
  test('a late search cannot replace a newer result; refresh keeps the editor and scroll', async () => {
    let page: Page | undefined;
    let releaseOld = () => {};
    try {
      page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
      const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
      await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
      let oldStarted!: () => void;
      const started = new Promise<void>(r => oldStarted = r);
      const held = new Promise<void>(r => releaseOld = r);
      await page.route('**/api/todos?**', async route => {
        const q = new URL(route.request().url()).searchParams.get('q');
        if (q === 'old') { oldStarted(); await held; }
        await route.fulfill({ json: { ...empty, queue: [item(9001, q === 'old' ? 'obsolete result' : 'current result'), ...Array.from({ length: 20 }, (_, i) => item(9010 + i, `fixture row ${i}`))] } });
      });
      await page.route('**/api/todos/9001/*', route => route.fulfill({ json: route.request().url().endsWith('work-order') ? null : [] }));
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
      const aside = page.locator('aside').filter({ has: page.getByText('TODO', { exact: true }) }).filter({ visible: true });
      await aside.getByRole('button', { name: /9001 current result/ }).waitFor();
      const search = aside.getByRole('textbox', { name: KO.line_239, exact: true });
      await search.fill('old');
      await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('old search not requested')), 5000))]);
      await search.fill('new');
      await refreshing(aside).waitFor({ state: 'detached' });
      releaseOld();
      await aside.getByRole('button', { name: /9001 current result/ }).click();
      // The note box stands under the request's own words, the detail's tab of that name.
      await page.getByRole('dialog').last().getByRole('tab', { name: wording('todo.label.request_text'), exact: true }).click();
      const input = page.getByRole('textbox', { name: KO.line_247, exact: true }).filter({ visible: true });
      await input.fill('keep my draft');
      // The detail stands over the list, and everything under it is out of a pointer's reach, so
      // the re-read is asked of the button itself.
      await page.evaluate(([selector, label]) => {
        const panel = [...document.querySelectorAll('aside')].find(one => one.querySelector(selector!))!;
        const button = [...panel.querySelectorAll('button')].find(one => (one.getAttribute('aria-label') ?? '') === label)!;
        button.click();
      }, [KO.line_252, KO.line_253]);
      await refreshing(aside).waitFor({ state: 'detached' });
      expect(await input.inputValue()).toBe('keep my draft');
      expect(await aside.getByText('obsolete result', { exact: true }).count()).toBe(0);
      await page.keyboard.press('Escape');
      await input.waitFor({ state: 'hidden' });
      const scroll = aside.locator('[class*="overflow-y-auto"]').first();
      await scroll.evaluate(e => { e.scrollTop = 400; });
      const before = await scroll.evaluate(e => e.scrollTop);
      await aside.getByRole('button', { name: wording('common.action.refresh'), exact: true }).click();
      await refreshing(aside).waitFor({ state: 'detached' });
      expect(await scroll.evaluate(e => e.scrollTop)).toBe(before);
    } finally { releaseOld(); await page?.context().close(); }
  }, 60000);
});

// Every screen that keeps a place for what it is fetching, at the two widths the rules name: its
// own title and toolbar stand from the first frame, the busy place stands inside the body, and
// nothing already on the screen moves when the answer lands. Every read but the login is held, so
// each region of the screen is caught waiting. A screen of a unit not split yet stands as a
// placeholder that fetches nothing (docs/boundary.md, 「Screens of units not yet split」), so none is
// among them.
describe.skipIf(!origin || !touchReady())('a screen keeps its frame while it fetches', () => {
  for (const width of [1440, 390]) {
    // Where a region a phone reaches through a drawer is the one fetching, the drawer is opened
    // first: that is where its place is kept, and it is where a reader goes to look.
    for (const [path, title, narrowOpen] of [
      ['agents', KO.line_280, null], ['live', KO.line_280_2, null], ['siren', KO.line_280_3, null],
      ['db', 'DB', null], ['archive', KO.line_282, null], ['documents', KO.line_282_2, KO.line_282_3],
      ['account', KO.line_283, null], ['', KO.line_283_2, null]
    ] as [string, string, string | null][]) {
      test(`${path} at ${width}px`, async () => {
        let page: Page | undefined;
        let release = () => {};
        try {
          page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));
          const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
          const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
          await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
          const hold = new Promise<void>(resolve => { release = resolve; });
          // The console's own reads, under its origin: a bare `**/api/**` also catches a module the
          // development server hands out by its path (`@vue/devtools-api/lib/esm/api/`), and the page
          // then never comes up at all.
          await page.route(`${origin}/api/**`, async route => {
            if (route.request().url().includes('/api/auth/')) { await route.continue(); return; }
            await hold;
            await route.continue();
          });
          await page.goto(`${origin}/${path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);

          // The screen says what it is before it knows anything.
          // The screen's own title rather than the sidebar's link of the same name: the sidebar
          // stands before it, and its own lists are being read too.
          const heading = page.getByText(title!, { exact: true }).filter({ visible: true }).last();
          await heading.waitFor();
          const waiting = (await heading.boundingBox())!;

          if (width < 1280 && narrowOpen !== null) {
            await page.getByRole('button', { name: narrowOpen, exact: true }).filter({ visible: true }).first().click();
          }

          // The place kept for the answer is inside the body and says it is busy.
          const busy = page.locator('[role=status][aria-busy=true]').filter({ visible: true }).first();
          await busy.waitFor();
          expect(await busy.locator('button,input,a,select,textarea').count()).toBe(0);
          const place = (await busy.boundingBox())!;
          expect(place.width).toBeLessThanOrEqual(width);
          expect(place.x).toBeGreaterThanOrEqual(0);

          release();
          await page.waitForFunction(() => [...document.querySelectorAll('[role=status][aria-busy=true]')].every(one => one.getBoundingClientRect().width === 0), null, { timeout: 20000 });

          // The title did not move when the answer landed.
          const landed = (await heading.boundingBox())!;
          expect(Math.abs(landed.y - waiting.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(landed.x - waiting.x)).toBeLessThanOrEqual(1);
          expect(errors).toEqual([]);
        } finally { release(); await page?.context().close(); }
      }, 60000);
    }
  }
});

// A list that is already on the screen stays on it while it is re-read, and the one thing that
// says so is the spinner on the refresh button. The notice beside it is for a reader who cannot see that
// spinner — the button is disabled and its icon aria-hidden while it turns — so it must carry
// the sentence without taking a line of the screen for it.
describe.skipIf(!origin || !touchReady())('the refresh notice is not on the screen', () => {
  for (const [where, path, api, panel] of [
    [KO.line_346, '', '**/api/todos?**', 'aside']
  ]) {
    test(`${where}: the spinner stands alone and the notice is read out only`, async () => {
      let page: Page | undefined;
      let release = () => {};
      try {
        page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
        const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
        await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
        await page.goto(`${origin}/${path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        const scope = page.locator(panel!).filter({ visible: true }).first();
        const reload = scope.getByRole('button', { name: wording('common.action.refresh'), exact: true });
        await reload.waitFor();
        await page.waitForFunction(() => document.querySelectorAll('[role=status][aria-busy=true]').length === 0);
        // Held from here on, so the whole of the refresh is looked at rather than raced with.
        const hold = new Promise<void>(r => release = r);
        await page.route(api!, async route => { await hold; await route.continue(); });
        await reload.click();
        const notice = refreshing(scope);
        await notice.first().waitFor();
        expect(await notice.count()).toBe(1);
        const box = (await notice.first().boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(1);
        expect(box.height).toBeLessThanOrEqual(1);
        expect(await reload.isDisabled()).toBe(true);
        expect(await reload.locator('.animate-spin').count()).toBe(1);
        release();
        await notice.waitFor({ state: 'detached' });
        expect(errors).toEqual([]);
      } finally { release(); await page?.context().close(); }
    }, 45000);
  }
});

// A page with the fixture login, the frame-by-frame record of every skeleton on it installed
// before the page's first byte is parsed.
async function openRecorded(width: number): Promise<Page> {
  const page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
  await page.addInitScript(() => {
    const seen: { hydrated: boolean; bars: number; regions: string[] }[] = [];
    Object.assign(window, { __frames: seen });
    let last = '';
    const onScreen = (e: Element) => {
      const box = e.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && getComputedStyle(e).visibility !== 'hidden';
    };
    const snap = () => {
      const hydrated = (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false;
      const bars = [...document.querySelectorAll('.animate-pulse')].filter(onScreen).length;
      // A region is its name, how many bars it draws and how tall it stands: what a reader would
      // see change if its shape changed.
      const regions = [...document.querySelectorAll('[role="status"][aria-busy="true"]')].filter(onScreen)
        .map(e => `${e.getAttribute('aria-label')}|${e.querySelectorAll('.animate-pulse').length}|${Math.round(e.getBoundingClientRect().height)}`).sort();
      const key = `${hydrated}${bars}${regions.join()}`;
      if (key !== last) { last = key; seen.push({ hydrated, bars, regions }); }
    };
    new MutationObserver(snap).observe(document, { subtree: true, childList: true, attributes: true });
    const tick = () => { snap(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  return page;
}

// Every screen that fetches, read from its first frame to the moment its skeletons are gone.
const SCREENS = ['', 'live', 'mail/', 'archive', 'siren', 'documents', 'db', 'agents', 'graph', 'account'];

describe.skipIf(!origin || !touchReady())('a skeleton stands once, from the read to its answer', () => {
  for (const width of [1440, 390]) {
    test(`no screen paints a skeleton before asking, and none changes shape at ${width}px`, async () => {
      for (const path of SCREENS) {
        const page = await openRecorded(width);
        try {
          await page.goto(`${origin}/${path}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
          await page.waitForFunction(() => document.querySelectorAll('[role=status][aria-busy=true]').length === 0, undefined, { timeout: 20000 });
          const frames = await page.evaluate(() => (window as any).__frames as { hydrated: boolean; bars: number; regions: string[] }[]);
          const where = `${path || 'home'} @${width}`;

          // Before the browser has taken the page over, nothing has been asked for.
          for (const frame of frames.filter(one => !one.hydrated)) {
            expect({ where, bars: frame.bars, regions: frame.regions }).toEqual({ where, bars: 0, regions: [] });
          }

          // Once standing, a region only ever goes away: what each frame holds is a part of what
          // stood before it, and nothing new stands once anything has turned into its content.
          let before: string[] | null = null;
          let settling = false;
          for (const frame of frames.filter(one => one.hydrated)) {
            if (before !== null) {
              const left = [...before];
              for (const region of frame.regions) {
                const at = left.indexOf(region);
                if (at !== -1) { left.splice(at, 1); continue; }
                const name = region.split('|')[0];
                // A region that mounts a frame later than its neighbours is still the first
                // stage; one standing under a name that stood a frame ago in another shape is not.
                expect({ where, region, changed: before.some(one => one.split('|')[0] === name) }).toEqual({ where, region, changed: false });
                expect({ where, region, afterAnAnswer: settling }).toEqual({ where, region, afterAnAnswer: false });
              }
              if (left.length > 0) settling = true;
            }
            before = frame.regions;
          }
        } finally { await page.context().close(); }
      }
    }, 240000);
  }
});

// What a screen says of the units it reads while it is still asking and once it failed. The live screen's
// failure is the one its read is answered with here; a room's box asks the console's own control road, whose
// receiver stand-in serves no health, so that failure is the real one. The ask is held to be looked at.
describe.skipIf(!origin || !touchReady())('asking the bot is not a failure', () => {
  for (const width of [1440, 390]) {
    test(`the live screen asks calmly and fails briefly at ${width}px`, async () => {
      const page = await openRecorded(width);
      let release = () => {};
      try {
        const hold = new Promise<void>(resolve => { release = resolve; });
        await page.route('**/api/status', async route => { await hold; await route.fulfill({ json: { reachable: false, live: [], compacting: [], liveAt: null, gates: [], runners: [], jobs: [], executions: [], watches: [] } }); });
        await page.goto(`${origin}/live`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        const asking = page.getByRole('button', { name: wording('common.aria.refresh_standing', { standing: wording('control.status.checking') }), exact: true });
        await asking.waitFor();
        const calm = await asking.evaluate(e => getComputedStyle(e).color);
        release();
        const failed = page.getByRole('button', { name: wording('common.aria.refresh_standing', { standing: wording('control.error.unreachable') }), exact: true });
        await failed.waitFor();
        const alarmed = await failed.evaluate(e => getComputedStyle(e).color);
        // Only the failure wears the error colour, so the two do not read alike.
        expect(alarmed).not.toBe(calm);
      } finally { release(); await page.context().close(); }
    }, 60000);

    test(`a room's box says it is asking before it says the bot is gone at ${width}px`, async () => {
      const page = await openRecorded(width);
      let release = () => {};
      try {
        const hold = new Promise<void>(resolve => { release = resolve; });
        await page.route('**/api/control', async route => { await hold; await route.continue(); });
        await page.goto(`${origin}/rooms/-1004`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        await page.locator(`textarea[placeholder="${wording('control.status.checking')}"]`).waitFor();
        release();
        await page.locator(`textarea[placeholder="${wording('control.error.unreachable')}"]`).waitFor();
      } finally { release(); await page.context().close(); }
    }, 60000);
  }
});

// The database screen's two placeholders stand beside a table in the dense layout, so each keeps
// that layout's own head and row heights rather than the own layout's taller ones.
describe.skipIf(!origin || !touchReady())('the database screen keeps its dense table shape while it reads', () => {
  const heights = async (within: Locator) => ({
    head: (await within.locator('thead tr').first().boundingBox())!,
    row: (await within.locator('tbody tr').first().boundingBox())!
  });

  for (const width of [1280, 360]) {
    test(`browse and query placeholders match the dense table at ${width}px`, async () => {
      let page: Page | undefined;
      let release = () => {};
      try {
        page = await browser!.newPage({ serviceWorkers: 'block', viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'skeleton259', password: 'fixture-password-259' }) });
        expect(login.ok).toBe(true);
        const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
        await page.context().addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: origin! }]);
        // The fixture account's own row stands in web_users, so the screen opens on a table whose row can be measured.
        await page.addInitScript(() => window.localStorage.setItem('bmo-web.db-view', JSON.stringify({ table: 'web_users', mode: 'table' })));

        // Browsing: the table list is held, so the first placeholder is caught standing.
        let hold = new Promise<void>(resolve => { release = resolve; });
        await page.route('**/api/db/tables*', async route => { await hold; await route.continue(); });
        await page.goto(`${origin}/db`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        const browse = page.getByRole('status', { name: wording('db.status.tables_loading'), exact: true });
        await browse.waitFor();
        const browsePlaceholder = await heights(browse);
        release();
        const rows = page.locator('table').filter({ hasText: 'skeleton259' }).filter({ visible: true }).first();
        await rows.waitFor();
        const browseTable = await heights(rows);
        console.log(`db ${width} browse skeleton head=${browsePlaceholder.head.height} row=${browsePlaceholder.row.height} table head=${browseTable.head.height} row=${browseTable.row.height}`);
        expect(Math.abs(browsePlaceholder.head.height - browseTable.head.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(browsePlaceholder.row.height - browseTable.row.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(browsePlaceholder.head.x - browseTable.head.x)).toBeLessThanOrEqual(1);

        // Asking a question: the answer is held, so the second placeholder is caught standing.
        hold = new Promise<void>(resolve => { release = resolve; });
        await page.route('**/api/db/query*', async route => { await hold; await route.continue(); });
        await page.goto(`${origin}/db?view=sql`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (document.querySelector('#__nuxt') as any)?.__vue_app__?.$nuxt?.isHydrating === false);
        await page.getByRole('textbox', { name: wording('db.aria.query'), exact: true }).fill('select 1 as one');
        await page.getByRole('button', { name: wording('db.action.run'), exact: true }).click();
        const answered = page.getByRole('status', { name: wording('db.status.result_loading'), exact: true });
        await answered.waitFor();
        const queryPlaceholder = await heights(answered);
        release();
        const answer = page.locator('table').filter({ hasText: 'one' }).filter({ visible: true }).first();
        await answer.waitFor();
        const queryTable = await heights(answer);
        console.log(`db ${width} query skeleton head=${queryPlaceholder.head.height} row=${queryPlaceholder.row.height} table head=${queryTable.head.height} row=${queryTable.row.height}`);
        expect(Math.abs(queryPlaceholder.head.height - queryTable.head.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(queryPlaceholder.row.height - queryTable.row.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(queryPlaceholder.head.x - queryTable.head.x)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
      } finally { release(); await page?.context().close(); }
    }, 60000);
  }
});

// The cache siren's list under a filter that leaves none of the rows read: its foot stays in view as each page
// lands, so the further pages are read one after another, and they are one wait — the foot's placeholder stands
// once and goes, never coming back between them.
describe.skipIf(!origin || !touchReady())('the cache siren reads its further pages under one placeholder', () => {
  const RING = 600;
  const event = (seq: number) => ({
    seq, atSeconds: Math.floor(Date.now() / 1000) - seq, project: 'project-a', session: 'session-a', agent: null, mode: 'claude-code',
    model: 'model-a', kind: 'warm', level: 'info', note: '', cause: null, newTokens: 10, readTokens: 100
  });

  for (const width of [1440, 390]) {
    test(`a filtered list at ${width}px`, async () => {
      const page = await openRecorded(width);
      try {
        let asked = 0;
        await page.addInitScript(() => {
          try { localStorage.setItem('bmo-web.siren-filter', JSON.stringify({ agent: 'all', kind: 'compact', model: 'all' })); } catch {}
        });
        await page.route(`${origin}/api/siren?**`, async route => {
          asked++;
          const limit = Number(new URL(route.request().url()).searchParams.get('limit'));
          await new Promise(resolve => setTimeout(resolve, 150));
          await route.fulfill({ json: {
            reachable: true, since: Date.now() - 600_000, newLastMinute: 10, perMinute: Array.from({ length: 10 }, () => 10), sessions30m: 1,
            sirenCount: 0, cacheShare: 0.9, coldCount: 0, settings: { armed: true, ttlMs: 3_600_000, threshold: 100_000 },
            events: Array.from({ length: Math.min(limit, RING) }, (_, at) => event(at + 1)), hasMore: limit < RING
          } });
        });
        await page.goto(`${origin}/siren`, { waitUntil: 'domcontentloaded' });
        const more = wording('siren.status.more_loading');
        // The run ends once the whole ring is held, and the list says it reached the end.
        await page.waitForFunction(() => document.querySelectorAll('[role=status][aria-busy=true]').length === 0 && (window as any).__frames.length > 0, undefined, { timeout: 30000 });
        await page.getByText(wording('siren.status.no_matching'), { exact: true }).waitFor();
        await page.waitForTimeout(1000);
        await page.waitForFunction(() => document.querySelectorAll('[role=status][aria-busy=true]').length === 0);
        const frames = await page.evaluate(() => (window as any).__frames as { regions: string[] }[]);
        const standing = frames.map(frame => frame.regions.some(region => region.startsWith(`${more}|`)));
        const stood = standing.filter((now, at) => now && !standing[at - 1]).length;

        // More than one page was read past the first, and the placeholder stood for them once.
        expect(asked).toBeGreaterThan(2);
        expect(stood).toBe(1);
      } finally { await page.context().close(); }
    }, 60000);
  }
});
