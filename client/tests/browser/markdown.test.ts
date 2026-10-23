import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { scratchDir } from "../support/scratch";

import { wording } from "../../apps/web/shared/wording";

import type { Browser, Page } from "playwright-core";
import KO from "../fixtures/browser/markdown.test.ko.json";

// What the console's markdown renderer lets reach a page. The cleaning is DOMPurify's, which needs a
// real DOM, so it is checked in a real browser with the renderer built exactly as the console ships
// it — skipped where the browser build is not on the machine, so a checkout without the cache says
// nothing about the cleaning.

const hostile = [
  KO.line_19,
  KO.line_20,
  "<script>window.ran = true</script>",
  '<img src=x onerror="window.ran = true">',
  KO.line_23,
  KO.line_24
].join("\n\n");

let browser: Browser;
let page: Page;
// The directory the renderer is built in, asked for where the file is read so its removal is
// registered for the whole file rather than for the hook that would have made it.
const scratch = scratchDir("bmo-web-markdown-");

describe.skipIf(!existsSync(chromium.executablePath()))("what reaches the page", () => {
  beforeAll(async () => {
    const entry = join(scratch, "entry.ts");

    await Bun.write(
      entry,
      `import { renderMarkdown } from ${JSON.stringify(new URL("../../apps/web/app/domain/markdown.ts", import.meta.url).pathname)};\n` +
        `import { wording } from ${JSON.stringify(new URL("../../apps/web/shared/wording.ts", import.meta.url).pathname)};\n` +
        "Object.assign(window, {\n" +
        "  renderMarkdown: (text: string, kind: string) => renderMarkdown(wording, text, kind as Parameters<typeof renderMarkdown>[2])\n" +
        "});\n"
    );

    const built = await Bun.build({ entrypoints: [entry], target: "browser", format: "iife" });

    expect(built.success).toBe(true);

    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent("<div id=out></div>");
    await page.addScriptTag({ content: await built.outputs[0]!.text() });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function standing(
    kind: "document" | "words" | "line" | "finding" | "book"
  ): Promise<{ ran: boolean; scripts: number; handlers: string[]; hrefs: string[]; targets: string[] }> {
    return page.evaluate(
      ([text, reading]) => {
        const out = document.getElementById("out")!;
        const scope: Window & { renderMarkdown?: (text: string, kind: string) => string; ran?: boolean } = window;

        scope.ran = false;
        out.innerHTML = scope.renderMarkdown!(text, reading);

        const links = [...out.querySelectorAll("a")];

        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ran: scope.ran === true,
                scripts: out.querySelectorAll("script").length,
                handlers: [...out.querySelectorAll("*")].flatMap((element) =>
                  element.getAttributeNames().filter((name) => name.startsWith("on"))
                ),
                hrefs: links.map((link) => link.getAttribute("href") ?? ""),
                targets: links.map((link) => `${link.getAttribute("target")} ${link.getAttribute("rel")}`)
              }),
            200
          )
        );
      },
      [hostile, kind] as const
    );
  }

  for (const kind of ["words", "document", "finding", "book"] as const) {
    test(`runs nothing and links nowhere a script is, read as ${kind}`, async () => {
      const seen = await standing(kind);

      expect(seen.ran).toBe(false);
      expect(seen.scripts).toBe(0);
      expect(seen.handlers).toEqual([]);
      expect(seen.hrefs.some((href) => href.startsWith("javascript:"))).toBe(false);
      expect(seen.hrefs).toContain("https://example.org");
      expect(seen.targets).toContain("_blank noopener noreferrer");
    }, 30_000);
  }

  test("keeps a book's source lines and heading marks through the cleaning", async () => {
    const marks = await page.evaluate((text) => {
      const out = document.getElementById("out")!;
      const scope: Window & { renderMarkdown?: (text: string, kind: string) => string } = window;

      out.innerHTML = scope.renderMarkdown!(text, "book");

      return [...out.children].map((element) => `${element.getAttribute("data-line")} ${element.getAttribute("data-heading")}`);
    }, KO.line_110);

    expect(marks).toEqual(["1 images", "3 forms", "5 null"]);
  }, 30_000);

  test("keeps the column count a table's box is laid out by through the cleaning", async () => {
    const columns = await page.evaluate((text) => {
      const out = document.getElementById("out")!;
      const scope: Window & { renderMarkdown?: (text: string, kind: string) => string } = window;

      out.innerHTML = scope.renderMarkdown!(text, "words");

      return (out.querySelector(".markdown-table") as HTMLElement | null)?.style.getPropertyValue("--columns").trim() ?? null;
    }, KO.line_123);

    expect(columns).toBe("2");
  }, 30_000);

  test("keeps a fenced block's copy button and its two marks through the cleaning", async () => {
    const button = await page.evaluate(() => {
      const out = document.getElementById("out")!;
      const scope: Window & { renderMarkdown?: (text: string, kind: string) => string } = window;

      out.innerHTML = scope.renderMarkdown!("```\nbun install\n```", "words");

      const found = out.querySelector(".markdown-code > button[data-copy]");

      return found === null ? null : { type: found.getAttribute("type"), label: found.getAttribute("aria-label"), tooltip: found.getAttribute("data-tooltip"), marks: found.querySelectorAll("svg path").length };
    });

    expect(button).toEqual({ type: "button", label: wording("common.action.copy"), tooltip: wording("common.action.copy"), marks: 2 });
  }, 30_000);

  test("runs nothing and links nowhere at all, read as a line", async () => {
    const seen = await standing("line");

    expect(seen.ran).toBe(false);
    expect(seen.scripts).toBe(0);
    expect(seen.handlers).toEqual([]);
    expect(seen.hrefs).toEqual([]);
  }, 30_000);
});
