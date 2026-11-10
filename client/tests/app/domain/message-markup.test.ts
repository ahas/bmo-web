import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { loadMessageReader, markdownHtml, messageReaderLoaded } from "../../../apps/web/app/domain/markdown";
import { messageMarkup } from "../../../apps/web/app/domain/message-markup";

// A message's markdown as the chat it went out to shows it (docs/web.md, 「A bubble reads as its message does in
// the chat」): the base library's reading into the chat's markup, made into the HTML a bubble stands as. The
// reading is checked here directly; the cleaning and the drawing are checked in a real browser.

// A code block's box, as the test names it: the block and the language handed over.
const boxed = (block: string, language: string): string => `<box language="${language}">${block}</box>`;

describe("a message, as its chat shows it", () => {
  test("stands as the formatting the chat has: bold, italic, strike, inline code, a link and a quote", () => {
    const html = messageMarkup("Some **bold**, *italic*, ~~gone~~ and `code`, a [link](https://example.com/a).\n\n> quoted\n> again", boxed);

    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<i>italic</i>");
    expect(html).toContain("<s>gone</s>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com/a">link</a>');
    expect(html).toContain("<blockquote>quoted\nagain</blockquote>");
  });

  test("lays flat what the chat has no formatting for: a heading, a list, a table", () => {
    const html = messageMarkup("# Title\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nwith **bold**", boxed);

    expect(html).not.toMatch(/<h1|<ul|<li|<table/);
    expect(html).toContain("Title");
    expect(html).toContain("• one\n• two");
    expect(html).toContain("a · b\n1 · 2");
  });

  test("covers a spoiler in a span a press uncovers", () => {
    const html = messageMarkup("the ending is ||a secret|| here", boxed);

    expect(html).toContain('<span class="markdown-spoiler" data-spoiler role="button" tabindex="0">a secret</span>');
    expect(html).not.toContain("tg-spoiler");
  });

  test("hands a code block to the console's own box, with the language its fence named", () => {
    const html = messageMarkup("before\n\n```rust\nfn main() { 1 < 2; }\n```\n\nafter **x**", boxed);

    expect(html).toContain('<box language="rust"><pre><code class="language-rust">fn main() { 1 &lt; 2; }\n</code></pre></box>');
    // The block ends its own line: the break the markup writes beside it is not drawn again.
    expect(html).toContain("before\n<box");
    expect(html).toContain("</box>\nafter");
  });

  test("makes a bare address a link, and leaves one inside a link or code as it is written", () => {
    const html = messageMarkup("see https://example.org/x?a=1&b=2 and `https://in.code/x` and [here](https://example.com) **now**", boxed);

    expect(html).toContain('<a href="https://example.org/x?a=1&amp;b=2">https://example.org/x?a=1&amp;b=2</a>');
    expect(html).toContain("<code>https://in.code/x</code>");
    expect(html).toContain('<a href="https://example.com">here</a>');
  });

  test("shows an apostrophe beside formatting as the character it is, never as its entity", () => {
    const html = messageMarkup("'the newest word' holds **only** at that pace, isn't it", boxed);

    expect(html).toContain("&#39;the newest word&#39; holds <b>only</b> at that pace, isn&#39;t it");
    expect(html).not.toContain("&amp;#39;");
  });

  test("shows HTML typed into it as the characters it was typed as", () => {
    const formatted = messageMarkup("<script>alert(1)</script> and **bold**", boxed);
    const plain = messageMarkup("<script>alert(1)</script> plainly", boxed);

    for (const html of [formatted, plain]) {
      expect(html).not.toContain("<script");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    }
  });
});

describe("the renderer's message kind", () => {
  test("stands as the text it was written as until the reading has arrived, and as the chat shows it after", async () => {
    if (!messageReaderLoaded()) {
      expect(markdownHtml(wording, "a **b** <i>", "message")).toBe("a **b** &lt;i&gt;");
    }

    await loadMessageReader();

    expect(messageReaderLoaded()).toBe(true);

    const html = markdownHtml(wording, "a **b**\n\n```sh\nls\n```", "message");

    expect(html).toContain("a <b>b</b>");
    // The code block stands in the console's own box, with its copy button.
    expect(html).toContain('<div class="markdown-code" data-language="sh">');
    expect(html).toContain("data-copy");
  });
});
