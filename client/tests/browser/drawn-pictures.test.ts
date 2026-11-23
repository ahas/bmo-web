import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import sharp from "sharp";

import { DrawnImage } from "../../apps/web/app/domain/drawn-image";
import { drawnCopy } from "../../apps/web/server/utils/drawn-pictures";
import { drawnSet, drawnStep, WIDTH_FIELD } from "../../apps/web/shared/drawn-pictures";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { VNode } from "vue";
import type { DrawnCut } from "../../apps/web/server/utils/drawn-pictures";

// A picture drawn small is drawn without jagged edges (docs/web.md, 「A picture drawn small」). The picture is a ring
// pattern whose rings grow finer toward its edge, the pattern a shrink without a filter breaks into ripples. It is
// served as the console's server serves a picture, its copies made by the server's own code, and drawn by Chromium
// at a screen density of 1.25, once from the kept file and once from the copies; what the browser draws is compared
// with the same picture shrunk properly to the pixels it covers.

const ready = touchReady();
const SIDE = 1024;
const DENSITY = 1.25;

let browser: Browser | null = null;
let server: ReturnType<typeof Bun.serve> | null = null;
let rings: Uint8Array = new Uint8Array();

async function ringPicture(): Promise<Uint8Array> {
  const raw = Buffer.alloc(SIDE * SIDE);

  for (let y = 0; y < SIDE; y += 1) {
    for (let x = 0; x < SIDE; x += 1) {
      const dx = x - SIDE / 2;
      const dy = y - SIDE / 2;

      raw[y * SIDE + x] = Math.round(127.5 + 127.5 * Math.cos((Math.PI * (dx * dx + dy * dy)) / (SIDE * 0.9)));
    }
  }

  return new Uint8Array(await sharp(raw, { raw: { width: SIDE, height: SIDE, channels: 1 } }).png().toBuffer());
}

beforeAll(async () => {
  if (!ready) return;

  rings = await ringPicture();
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const cut: DrawnCut = url.pathname === "/face" ? "square" : "shape";
      const step = drawnStep(url.searchParams.get(WIDTH_FIELD) ?? undefined);
      const picture = step === null ? { bytes: rings, type: "image/png" } : await drawnCopy(`rings/${url.pathname}`, { bytes: rings, type: "image/png" }, step, cut);

      return new Response(picture.bytes.slice(), { headers: { "content-type": picture.type } });
    }
  });
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
}, BROWSER_HOOK_MS);

// How far what the browser drew stands from the picture shrunk properly, as the root of the mean squared difference
// of the grey levels, 0 to 255.
async function distance(page: Page, id: string, css: number): Promise<number> {
  const pixels = Math.round(css * DENSITY);
  const shot = await page.locator(`#${id}`).screenshot({ scale: "device" });
  const drawn = await sharp(shot).resize(pixels, pixels, { kernel: "nearest" }).greyscale().raw().toBuffer();
  const proper = await sharp(rings).resize(pixels, pixels, { kernel: "lanczos3" }).greyscale().raw().toBuffer();
  let sum = 0;

  for (let at = 0; at < drawn.length; at += 1) sum += (drawn[at]! - proper[at]!) ** 2;

  return Math.sqrt(sum / drawn.length);
}

// The image element a face is drawn in, as the avatar hands it its address and the width its size draws it at.
function faceElement(id: string, src: string, width: number): string {
  const props = (DrawnImage({}, { attrs: { src, width, height: width }, slots: {}, emit: () => undefined }) as VNode).props ?? {};
  const named = Object.entries(props).filter(([, value]) => value !== undefined).map(([name, value]) => `${name}="${String(value)}"`);

  return `<img id="${id}" ${named.join(" ")} style="width:${width}px;height:${width}px;object-fit:cover">`;
}

describe.skipIf(!ready)("a picture drawn small", () => {
  test("is drawn from a copy near its own size, with none of the ripples the kept file shrinks into", async () => {
    const origin = `http://127.0.0.1:${server!.port}`;
    const page = await browser!.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: DENSITY });

    try {
      // A face as the console draws one, in its circle's box, and a picture 420 pixels wide: each from the kept file
      // and from the copies.
      await page.setContent(`<body style="margin:0;display:flex;flex-wrap:wrap;gap:8px;align-items:start">
        <img id="face-kept" src="${origin}/face" width="40" height="40" style="width:40px;height:40px;object-fit:cover">
        ${faceElement("face-drawn", `${origin}/face`, 40)}
        <img id="wide-kept" src="${origin}/wide" style="width:420px;height:420px">
        <img id="wide-drawn" src="${origin}/wide" srcset="${drawnSet(`${origin}/wide`)}" sizes="420px" style="width:420px;height:420px">
      </body>`);
      await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 30_000 });

      const chosen = await page.evaluate(() => Object.fromEntries([...document.images].map((image) => [image.id, image.currentSrc])));

      // The browser chose the first step that covers the pixels the picture stands on, and no wider one.
      expect(new URL(chosen["face-drawn"]!).searchParams.get("w")).toBe(String(drawnStep(String(40 * DENSITY))));
      expect(new URL(chosen["wide-drawn"]!).searchParams.get("w")).toBe(String(drawnStep(String(420 * DENSITY))));
      // A picture asked for with no width, as the viewer asks for it, is the kept file.
      expect(new URL(chosen["wide-kept"]!).searchParams.has("w")).toBe(false);

      const wideKept = await distance(page, "wide-kept", 420);
      const wideDrawn = await distance(page, "wide-drawn", 420);
      const faceKept = await distance(page, "face-kept", 40);
      const faceDrawn = await distance(page, "face-drawn", 40);

      // The kept file shrunk 1.95 times breaks into ripples, standing about as far from the proper shrink as sampling
      // with no filter does (41 of 255 when measured); the copy stands less than half as far.
      expect(wideKept).toBeGreaterThan(30);
      expect(wideDrawn).toBeLessThan(wideKept / 2);
      // A face is drawn from a copy closer to the proper shrink than the kept file comes.
      expect(faceDrawn).toBeLessThan(faceKept);
    } finally {
      await page.close();
    }
  });

  test("goes out as kept where the step asked is at or past its own width", async () => {
    const kept = { bytes: rings, type: "image/png" };

    expect(await drawnCopy("rings/whole", kept, 2048, "shape")).toBe(kept);
    expect(await drawnCopy("rings/whole", kept, SIDE, "square")).toBe(kept);
  });
});
