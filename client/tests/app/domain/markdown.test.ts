import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { markdownHeadings } from "../../../apps/web/shared/markdown-structure";
import { markdownHtml } from "../../../apps/web/app/domain/markdown";
import KO from "../../fixtures/app/domain/markdown.test.ko.json";

// What a markdown text becomes. The reading is checked here directly, since marked needs no DOM;
// the cleaning is DOMPurify's, which needs a real one, so it is checked in a real browser beside the
// other browser checks (`client/browser/markdown.test.ts`).

describe("words, as the archive holds them", () => {
  test("stand as their formatting", () => {
    const html = markdownHtml(wording, KO.line_14, "words");

    expect(html).toContain(KO.line_16);
    expect(html).toContain("<code>code</code>");
    expect(html).toMatch(new RegExp(KO.line_18));
    expect(html).toContain("<pre><code>fenced\n</code></pre>");
  });

  test("break a line where a line was broken", () => {
    expect(markdownHtml(wording, KO.line_23, "words")).toContain(KO.line_23_2);
  });

  test("show the HTML typed into them as the characters it was typed as", () => {
    const html = markdownHtml(wording, KO.line_27, "words");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Array&lt;string&gt;");
  });

  test("never load an image, but link to where it is", () => {
    const html = markdownHtml(wording, KO.line_37, "words");

    expect(html).not.toContain("<img");
    expect(html).toContain(KO.line_40);
  });

  test("end a bare address where the Korean sentence goes on, and keep a pair of brackets inside it", () => {
    const html = markdownHtml(wording, KO.line_44, "words");

    expect(html).toBe(
      KO.line_47
    );
  });
});

describe("a line, as a strip or a label holds it", () => {
  test("takes the formatting that fits inside a line", () => {
    const html = markdownHtml(wording, KO.line_54, "line");

    expect(html).toContain(KO.line_56);
    expect(html).toContain("<code>code</code>");
  });

  test("stands a link and an image as their words, since the line may itself be a link", () => {
    const html = markdownHtml(wording, KO.line_61, "line");

    expect(html).not.toContain("<a");
    expect(html).not.toContain("<img");
    expect(html).toContain(KO.line_65);
    expect(html).toContain(KO.line_66);
  });

  test("folds its newlines and its block markup into the one line", () => {
    const html = markdownHtml(wording, KO.line_70, "line");

    expect(html).not.toMatch(/<(p|ul|ol|li|h[1-6]|br|pre|blockquote)\b/);
    expect(html).toBe(KO.line_73);
  });

  test("shows the HTML typed into it as the characters it was typed as", () => {
    const html = markdownHtml(wording, KO.line_77, "line");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});

describe("a document, as a checkout holds it", () => {
  test("joins the lines it was wrapped at into one paragraph", () => {
    expect(markdownHtml(wording, KO.line_87, "document")).toContain(KO.line_87_2);
  });

  test("keeps the HTML and the images it was written with, for the cleaning to judge", () => {
    const html = markdownHtml(wording, KO.line_91, "document");

    expect(html).toContain("<details>");
    expect(html).toContain(KO.line_94);
  });
});

describe("the structure lines a search writes, read as words", () => {
  test("stand as the words they are", () => {
    expect(markdownHtml(wording, KO.line_316, "words")).toBe(
      KO.line_317
    );
  });
});

describe("a book, as the document viewer shows it", () => {
  const source = [
    KO.line_324,
    "",
    KO.line_326,
    KO.line_327,
    "",
    "[ref]: https://example.org/ref",
    "",
    KO.line_331,
    "",
    KO.line_333,
    KO.line_334,
    "",
    "```md",
    KO.line_337,
    "```",
    "",
    KO.line_340,
    KO.line_341,
    "",
    KO.line_343
  ].join("\n");

  test("joins wrapped lines into a paragraph and stamps each block with the line it starts on", () => {
    const html = markdownHtml(wording, source, "book");

    expect(html).toContain(KO.line_349);
    expect(html).toContain(KO.line_350);
    expect(html).toContain(KO.line_351);
    expect(html).toContain('<ul data-line="10">');
    expect(html).toContain('<div data-line="13" class="markdown-code" data-language="md">');
    expect(html).toContain(KO.line_354);
  });

  test("gives each heading the mark its table of contents entry carries", () => {
    const html = markdownHtml(wording, source, "book");
    const marks = [...html.matchAll(/data-heading="([^"]+)"/g)].map((match) => match[1]);

    expect(marks).toEqual(markdownHeadings(source).map((heading) => heading.slug));
  });

  test("shows typed HTML as its characters and links an image instead of loading it", () => {
    const html = markdownHtml(wording, source, "book");

    expect(html).not.toContain("<div onclick");
    expect(html).toContain(KO.line_368);
    expect(html).not.toContain("<img");
    expect(html).toContain(KO.line_370);
  });

  test("stamps a text written with carriage returns on the same lines", () => {
    expect(markdownHtml(wording, "# a\r\n\r\nb", "book")).toContain('<p data-line="3">b</p>');
  });
});

// A Korean sentence closes its emphasis on a bracket or a quote and goes straight on into a
// particle, which is exactly where CommonMark refuses to close it; every kind of text still sets it.
describe("strong words in Korean, in every kind of text", () => {
  const kinds = ["document", "words", "line", "book"] as const;

  test("closes on a bracket that a particle follows", () => {
    for (const kind of kinds) {
      const html = markdownHtml(wording, KO.line_385, kind);

      expect(html).toContain(KO.line_387);
      expect(html).not.toContain("**");
    }
  });

  test("leaves a lone pair of stars and the ordinary forms as they were", () => {
    expect(markdownHtml(wording, KO.line_393, "words")).toContain(KO.line_393);
    expect(markdownHtml(wording, KO.line_394, "words")).toContain(KO.line_394_2);
  });
});

// A fenced block is what gets carried somewhere else — a command, a configuration — so every kind
// of text with blocks stands a copy button beside it; a line of inline code is part of a sentence
// and carries none.
describe("a fenced block, in every kind of text that has blocks", () => {
  const kinds = ["document", "words", "book"] as const;

  test("stands in a box of its own with a copy button after it", () => {
    const copy = wording("common.action.copy").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const box = new RegExp(`<div[^>]*class="markdown-code"[^>]*>(<div class="markdown-code-head">.*?</div>)?<pre><code class="language-sh">bun install\\n?</code></pre><button type="button" class="markdown-copy" data-copy aria-label="${copy}" data-tooltip="${copy}">`);

    for (const kind of kinds) {
      const html = markdownHtml(wording, KO.line_409, kind);

      expect(html).toMatch(box);
    }
  });

  test("names the language its fence gives at its head, and a fence with none carries no head", () => {
    for (const kind of kinds) {
      const named = markdownHtml(wording, "```shell title=x\ncurl -s https://example.com\n```\n", kind);
      const bare = markdownHtml(wording, "```\ncurl -s https://example.com\n```\n", kind);

      expect(named).toMatch(/class="markdown-code" data-language="shell"><div class="markdown-code-head"><span class="markdown-code-language">shell<\/span><\/div><pre>/);
      expect(bare).not.toContain("data-language");
      expect(bare).not.toContain("markdown-code-head");
    }
  });

  test("gives inline code and a line no button", () => {
    for (const kind of [...kinds, "line"] as const) {
      expect(markdownHtml(wording, KO.line_428, kind)).not.toContain("markdown-copy");
    }
  });
});

describe("a tilde, in every kind of text", () => {
  const kinds = ["document", "words", "line", "book"] as const;

  test("one on each side is a range and stands as written", () => {
    for (const kind of kinds) {
      const html = markdownHtml(wording, KO.line_438, kind);

      expect(html).not.toContain("<del");
      expect(html).toContain(KO.line_441);
    }
  });

  test("a single pair around words is not a strike either", () => {
    for (const kind of kinds) {
      expect(markdownHtml(wording, KO.line_447, kind)).toContain(KO.line_447_2);
    }
  });

  test("two on each side still strike", () => {
    for (const kind of kinds) {
      expect(markdownHtml(wording, KO.line_453, kind)).toContain(KO.line_453_2);
    }
  });
});

describe("a table, in every kind of text that has blocks", () => {
  const kinds = ["document", "words", "book"] as const;
  const table = KO.line_560;

  test("stands in a box of its own that knows how many columns the table has", () => {
    for (const kind of kinds) {
      expect(markdownHtml(wording, table, kind)).toMatch(/^<div (data-line="1" )?class="markdown-table" style="--columns: 3"><table>[\s\S]*<\/table>\s*<\/div>/);
    }
  });

  test("the box is the block a book stamps with its source line", () => {
    expect(markdownHtml(wording, `${KO.line_569}${table}`, "book")).toContain('<div data-line="3" class="markdown-table" style="--columns: 3"><table>');
  });
});

// marked hands a renderer a picture's words already escaped and every other token's words as they
// were typed, so each is escaped exactly once on its way out.
describe("the characters HTML reserves", () => {
  const once = "Pearl &amp; Cyan &quot;&lt;b&gt;&quot;";

  test("stand as they were typed where a picture is only linked", () => {
    for (const kind of ["words", "line", "book"] as const) {
      const html = markdownHtml(wording, '![Pearl & Cyan "<b>"](https://example.com/p.png)', kind);

      expect(html).toContain(once);
      expect(html).not.toContain("&amp;amp;");
    }
  });
});

describe("a diagram block", () => {
  const source = ["```mermaid", "flowchart TD", "  a[<b>request</b>] --> b", "```"].join("\n");

  for (const kind of ["words", "document", "book"] as const) {
    test(`stands as a diagram's place holding its source and its zoom buttons, with no copy button, read as ${kind}`, () => {
      const html = markdownHtml(wording, source, kind);

      expect(html).toContain('class="markdown-diagram" data-diagram><pre><code>flowchart TD\n  a[&lt;b&gt;request&lt;/b&gt;] --&gt; b</code></pre><div class="markdown-diagram-tools">');
      expect([...html.matchAll(/data-diagram-zoom="(\w+)" aria-label="([^"]*)" data-tooltip="([^"]*)"/g)].map((found) => found.slice(1))).toEqual(
        ([["out", "common.action.zoom_out"], ["in", "common.action.zoom_in"], ["fit", "common.action.fit_screen"]] as const).map(([towards, key]) => [towards, wording(key), wording(key)])
      );
      expect(html).toMatch(/<\/div><\/div>\n$/);
      expect(html).not.toContain("data-copy");
    });
  }

  test("is named by the first word of the fence's language, in any case", () => {
    expect(markdownHtml(wording, "```Mermaid title\nflowchart TD\n```", "words")).toContain("data-diagram");
    expect(markdownHtml(wording, "```mermaidish\nflowchart TD\n```", "words")).not.toContain("data-diagram");
  });
});

