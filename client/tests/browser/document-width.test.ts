import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { scratchDir } from "../support/scratch";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A document read at a phone's width moves only up and down (docs/web.md, 「Document viewer screen」): a wide
// table and a code block scroll inside their own boxes, a long address and a long run of code break at the
// column's edge, a diagram stands whole inside the column, and it zooms in place under the wheel
// (「A diagram block is drawn as its diagram」). The document is drawn by the console's renderer and the layer's
// diagram drawing as the console ships them, under both stylesheets, in a reading box shaped as the viewer's —
// with nothing clipping it sideways, so whatever is too wide shows; skipped where the browser build is not on the
// machine.

const WIDTH = 375;

const app = new URL("../../apps/web/", import.meta.url).pathname;
const ready = touchReady();
const scratch = scratchDir("bmo-web-document-width-");

const DOCUMENT = [
  "# Wide things",
  "",
  "An address with no space in it: https://example.org/a/very/long/path/that/never/breaks/on/its/own/and/keeps/running/past/the/edge?with=query&and=more_parameters_still",
  "",
  "A long run of code: `a_very_long_identifier_name_that_does_not_break_anywhere_at_all_in_this_line`",
  "",
  "| Column one | Column two | Column three | Column four | Column five | Column six |",
  "|---|---|---|---|---|---|",
  "| a cell | another cell with more words in it | `code_in_a_cell_that_is_long` | fourth | fifth | sixth with words |",
  "",
  "```text",
  "a code line that is much longer than a phone is wide and scrolls inside its own box rather than the page",
  "```",
  "",
  "```mermaid",
  "flowchart LR",
  ...Array.from({ length: 6 }, (_, at) => `  N${at}[a box with a long label ${at}] --> N${at + 1}`),
  "```",
  "",
  "The end."
].join("\n");

let browser: Browser;
let page: Page;

describe.skipIf(!ready)("a document at a phone's width", () => {
  beforeAll(async () => {
    const entry = join(scratch, "entry.ts");
    const diagram = Bun.resolveSync("bmo-ui/app/domain/diagram", app);

    await Bun.write(
      entry,
      `import { renderMarkdown } from ${JSON.stringify(join(app, "app/domain/markdown.ts"))};\n` +
        `import { wording } from ${JSON.stringify(join(app, "shared/wording.ts"))};\n` +
        `import { drawDiagrams } from ${JSON.stringify(diagram)};\n` +
        "const out = document.getElementById(\"out\")!;\n" +
        "out.innerHTML = renderMarkdown(wording, (window as unknown as { source: string }).source, \"book\");\n" +
        "(window as unknown as { drawn: Promise<void> }).drawn = drawDiagrams(out, false);\n"
    );

    const built = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm" });

    expect(built.success).toBe(true);

    // Both stylesheets as they ship; what only the build resolves — the framework's imports and directives — the
    // browser leaves aside.
    const sheets = await Promise.all(
      [join(app, "app/assets/css/main.css"), join(diagram, "../../assets/css/main.css")].map((path) => Bun.file(path).text())
    );

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: WIDTH, height: 800 }, deviceScaleFactor: 2 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheets.join("\n")}</style>` +
        '<style>html, body { margin: 0; } #pane { height: 100vh; overflow-y: auto; padding: 16px; box-sizing: border-box; }</style>' +
        '<div id="pane"><div id="out" class="markdown markdown--book" style="max-width: 48rem; margin-inline: auto"></div></div>'
    );
    await page.evaluate((source) => {
      (window as unknown as { source: string }).source = source;
    }, DOCUMENT);
    await page.addScriptTag({ type: "module", content: await built.outputs[0]!.text() });
    await page.waitForFunction(() => "drawn" in window);
    await page.evaluate(async () => (window as unknown as { drawn: Promise<void> }).drawn);
  }, BROWSER_HOOK_MS);

  afterAll(async () => {
    await browser?.close();
  }, BROWSER_HOOK_MS);

  test("never scrolls the page or the reading box sideways", async () => {
    const seen = await page.evaluate(() => {
      const pane = document.getElementById("pane")!;
      const column = document.getElementById("out")!;
      const right = column.getBoundingClientRect().right;
      const past = [...column.querySelectorAll<HTMLElement>("p, h1, a, code, .markdown-table, .markdown-code, .markdown-diagram, .markdown-diagram-figure, svg")]
        .filter((element) => !element.closest(".markdown-table, .markdown-code pre, .markdown-diagram-figure svg *"))
        .filter((element) => element.getBoundingClientRect().right > right + 0.5)
        .map((element) => element.tagName + "." + element.getAttribute("class"));

      return {
        page: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        pane: [pane.scrollWidth, pane.clientWidth],
        past,
        drawn: document.querySelector<HTMLElement>("#out [data-diagram]")?.dataset.drawn ?? null
      };
    });

    expect(seen.drawn).toBe("neo");
    expect(seen.page).toBeLessThanOrEqual(seen.innerWidth);
    expect(seen.pane[0]).toBeLessThanOrEqual(seen.pane[1]!);
    expect(seen.past).toEqual([]);
  }, 60_000);

  test("scrolls a wide table and a long code line inside their own boxes", async () => {
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#out .markdown-table, #out .markdown-code pre")].map((box) => ({
        scrolls: box.scrollWidth > box.clientWidth,
        overflow: getComputedStyle(box).overflowX
      }))
    );

    expect(boxes).toEqual([
      { scrolls: true, overflow: "auto" },
      { scrolls: true, overflow: "auto" }
    ]);
  }, 60_000);

  test("stands the diagram whole in the column", async () => {
    const sizes = await page.evaluate(() => {
      const column = document.getElementById("out")!.clientWidth;
      const figure = document.querySelector<HTMLElement>("#out .markdown-diagram-figure")!;

      return {
        column,
        diagram: figure.querySelector("svg")!.getBoundingClientRect().width,
        figureScrolls: figure.scrollWidth > figure.clientWidth
      };
    });

    expect(sizes.diagram).toBeLessThanOrEqual(sizes.column);
    expect(sizes.diagram).toBeGreaterThan(sizes.column - 2);
    expect(sizes.figureScrolls).toBe(false);
  }, 60_000);

  test("zooms the diagram under the wheel and back to fitting from its button", async () => {
    const transform = () => page.evaluate(() => document.querySelector<SVGSVGElement>("#out .markdown-diagram-figure svg")!.style.transform);
    const figure = page.locator("#out .markdown-diagram-figure");

    await figure.scrollIntoViewIfNeeded();

    const box = (await figure.boundingBox())!;

    expect(await transform()).toBe("");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForFunction(() => document.querySelector<SVGSVGElement>("#out .markdown-diagram-figure svg")!.style.transform !== "");

    expect(await transform()).toMatch(/scale\((?!1\))[\d.]+\)/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.click("#out [data-diagram-zoom=fit]");

    expect(await transform()).toBe("");
  }, 60_000);
});
