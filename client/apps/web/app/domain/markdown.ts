import DOMPurify from "dompurify";
import { Marked, Renderer, Tokenizer } from "marked";

import { markdownHeadings } from "../../shared/markdown-structure";
import { addressAsWritten, isWebAddress } from "../../shared/web-address";
import { isDiagram } from "bmo-ui/app/domain/diagram";

import type { Translate } from "../../shared/wording";
import type { Token, TokenizerAndRendererExtension, TokenizerObject, Tokens } from "marked";

// Markdown written to be read, turned into the HTML that stands for it. Every place the console
// shows such a text builds it here — the code panel's documents and the archive's words alike —
// so there is one renderer and one set of rules for what may come out of it.
//
// Nothing in here may be reached from the server: DOMPurify cleans against a real DOM and there
// is none on the server, and every screen renders there as well. So the module is asked for with
// a dynamic import at the moment a text is first shown (see markdown-load), which is also what
// keeps it out of the console's entry and in a chunk of its own.

// What a text is, which is the whole of what its reading varies in.
//
// A document is a file out of one of the owner's checkouts. It is wrapped to a column by hand, so
// wrapped lines are joined into a paragraph — markdown's own rule, and a break at every newline
// would tear each paragraph into ribbons — and whatever HTML or image it carries is part of it.
//
// Words are what the archive holds: a report, an instruction, a line of a log, a message. They
// are written a line at a time, so a newline is a line break. Whoever wrote them, the HTML in them
// stands as the characters it was typed as rather than becoming elements, and an image stands as
// a link to where it is: a line of someone else's text is not to make the browser of whoever
// opened the console call a server of their choosing.
//
// A line is words that stand on one line of a screen — a strip that slides, a reason after its
// label. It takes only what fits inside a line: bold and inline code. Its newlines fold into the
// line and block markup stays the characters it is. A link or an image stands as its own words,
// since a line is often itself something to press — the strip is a link — and a link inside a
// link sends one press two ways. Typed HTML stands as its characters, as in words.
//
// A book is a document the document viewer shows: wrapped lines join into a paragraph as in a
// document, but typed HTML stands as its characters and an image as a link, as in words — the
// brain's documents are what editors copied out of rooms, so an address someone else wrote is not
// to make the console's browser call it. Each top-level block carries the source line it starts
// on, and each heading the mark the table of contents gives it (see markdown-structure), which is
// what the viewer's table of contents and its two panes steer by.
//
// In every kind a strike is two tildes on each side and nothing less. One tilde is a range of
// figures, three to five, ten to twelve o'clock, and stands as the character it is.
export type MarkdownKind = "document" | "words" | "line" | "book";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

const MARKED_ESCAPES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };

// The words of a picture as they were typed. marked hands a renderer a picture's words already
// escaped, unlike every other token's, so they are taken back to their characters before being
// escaped once for where they stand.
function pictureWords(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => MARKED_ESCAPES[entity]!);
}

// A picture where pictures are not drawn: a link to it, named by its words.
function pictureLink({ href, text }: Tokens.Image): string {
  const words = pictureWords(text);

  return `<a href="${escapeHtml(href)}">${escapeHtml(words === "" ? href : words)}</a>`;
}

// Strong words whose closing pair CommonMark refuses: one standing after a bracket or a quote and
// before a letter, which is how a Korean sentence closes an emphasis and goes straight on into its
// particle, a bold word with its particle written straight after it. The ordinary reading goes
// first, and this one only where it opened nothing, so what CommonMark sets is set as it always was.
const STRONG = /^\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*(?!\*)/;

function koreanStrong(this: Tokenizer, src: string, masked: string, previous?: string): Tokens.Strong | Tokens.Em | undefined {
  const standard = Tokenizer.prototype.emStrong.call(this, src, masked, previous);

  if (standard !== undefined) return standard;

  const strong = STRONG.exec(src);

  return strong === null ? undefined : { type: "strong", raw: strong[0], text: strong[1]!, tokens: this.lexer.inlineTokens(strong[1]!) };
}

// A bare address ends where the sentence takes over — at a Korean letter written straight after
// it, a particle written onto the address, and at a closing bracket it did not open — by the rule every place that finds
// addresses shares (see web-address). GFM as marked reads it runs on through the letters.
function sentenceUrl(this: Tokenizer, src: string): Tokens.Link | undefined {
  const standard = Tokenizer.prototype.url.call(this, src);

  if (standard === undefined || standard.href.startsWith("mailto:")) return standard;

  const raw = addressAsWritten(standard.raw);

  if (raw === standard.raw) return standard;

  const www = /^www\./i.test(raw);

  if (!www && !isWebAddress(raw)) return undefined;

  const text = escapeHtml(raw);

  return { type: "link", raw, text, href: www ? `http://${raw}` : raw, tokens: [{ type: "text", raw: text, text }] };
}

const STRIKE = /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?=[^~]|$)/;

// GFM as marked reads it strikes a text between single tildes too. Here a strike is only the
// double form; a run of tildes that opens none is the characters it is.
const tildes: TokenizerObject = {
  emStrong: koreanStrong,
  url: sentenceUrl,
  del(src) {
    const strike = STRIKE.exec(src);

    if (strike !== null) {
      return { type: "del", raw: strike[0], text: strike[1]!, tokens: this.lexer.inlineTokens(strike[1]!) };
    }

    const run = /^~+/.exec(src);

    if (run === null) return false;

    const characters: Tokens.Generic = { type: "text", raw: run[0], text: run[0] };

    // marked takes whatever token a tokenizer answers with, though its types hold this one to a strike.
    return characters as Tokens.Del;
  }
};

// A table stands in a box of its own that scrolls it sideways, so the table can be laid out wider
// than the column it stands in — which is what keeps its columns readable on a narrow screen — while
// the page itself never moves sideways. The box carries how many columns the table has, since how
// wide a table may be laid out goes by that; the width itself is the stylesheet's.
function scrollingTable(this: Renderer, token: Tokens.Table): string {
  const table = Renderer.prototype.table.call(this, token);

  return `<div class="markdown-table" style="--columns: ${token.header.length}">${table}</div>`;
}

// The language a fence names: the first word of its info string, as markdown reads it.
function fenceWord(info: string | undefined): string {
  return (info ?? "").trim().split(/\s+/)[0] ?? "";
}

// A fenced block is what a reader carries somewhere else whole — a command, a configuration — so it
// stands in a box of its own with a copy button over its corner. The button is drawn here, with
// the rest of the text, so every place that shows such a text has it; what a press does is the
// component's that put the text on the screen (see domain/code-copy). Both of its states are
// drawn, and the stylesheet shows the one the button is in.
//
// A fenced block written in a diagram language is not code to carry anywhere but a picture to look
// at, so it stands as a diagram's place instead (see domain/diagram), with no copy button but its
// zoom buttons — zoom out, zoom in and fit — drawn here for the same reason the copy button is; the
// diagram module zooms it and shows them once it is drawn.
//
// A block whose fence names a language carries that word at its top left and on the box, which is
// what colours it once it is on the screen (see domain/code-colour).
const COPY_ICON =
  '<svg class="markdown-copy-idle" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 18q-.825 0-1.412-.587T7 16V4q0-.825.588-1.412T9 2h9q.825 0 1.413.588T20 4v12q0 .825-.587 1.413T18 18zm0-2h9V4H9zm-4 6q-.825 0-1.412-.587T3 20V6h2v14h11v2zm4-6V4z"/></svg>';
const COPIED_ICON =
  '<svg class="markdown-copy-done" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9.55 18l-5.7-5.7l1.425-1.425L9.55 15.15l9.175-9.175L20.15 7.4z"/></svg>';

const ZOOM_ICONS = {
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m19.6 21l-6.3-6.3q-.75.6-1.725.95T9.5 16q-2.725 0-4.612-1.888T3 9.5t1.888-4.612T9.5 3t4.613 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3l6.3 6.3zM9.5 14q1.875 0 3.188-1.312T14 9.5t-1.312-3.187T9.5 5T6.313 6.313T5 9.5t1.313 3.188T9.5 14M7 10.5v-2h5v2z"/></svg>',
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m19.6 21l-6.3-6.3q-.75.6-1.725.95T9.5 16q-2.725 0-4.612-1.888T3 9.5t1.888-4.612T9.5 3t4.613 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3l6.3 6.3zM9.5 14q1.875 0 3.188-1.312T14 9.5t-1.312-3.187T9.5 5T6.313 6.313T5 9.5t1.313 3.188T9.5 14m-1-1.5v-2h-2v-2h2v-2h2v2h2v2h-2v2z"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 9V6h-3V4h3q.825 0 1.413.588T22 6v3zM2 9V6q0-.825.588-1.412T4 4h3v2H4v3zm15 11v-2h3v-3h2v3q0 .825-.587 1.413T20 20zM4 20q-.825 0-1.412-.587T2 18v-3h2v3h3v2zm2-4V8h12v8zm2-2h8v-4H8zm0 0v-4z"/></svg>'
} as const;

const ZOOM_WORDS = { out: "common.action.zoom_out", in: "common.action.zoom_in", fit: "common.action.fit_screen" } as const;

function zoomTools(): string {
  const buttons = (Object.keys(ZOOM_ICONS) as (keyof typeof ZOOM_ICONS)[]).map((towards) => {
    const name = escapeHtml(speak(ZOOM_WORDS[towards]));

    return `<button type="button" data-diagram-zoom="${towards}" aria-label="${name}" data-tooltip="${name}">${ZOOM_ICONS[towards]}</button>`;
  });

  return `<div class="markdown-diagram-tools">${buttons.join("")}</div>`;
}

function copyableCode(this: Renderer, token: Tokens.Code): string {
  if (isDiagram(token.lang)) {
    return `<div class="markdown-diagram" data-diagram><pre><code>${escapeHtml(token.text)}</code></pre>${zoomTools()}</div>\n`;
  }

  const block = Renderer.prototype.code.call(this, token).trimEnd();
  const language = escapeHtml(fenceWord(token.lang));
  const named = language === "" ? "" : ` data-language="${language}"`;
  const head = language === "" ? "" : `<div class="markdown-code-head"><span class="markdown-code-language">${language}</span></div>`;

  return `<div class="markdown-code"${named}>${head}${block}<button type="button" class="markdown-copy" data-copy aria-label="${escapeHtml(speak("common.action.copy"))}" data-tooltip="${escapeHtml(speak("common.action.copy"))}">${COPY_ICON}${COPIED_ICON}</button></div>\n`;
}

const documents = new Marked({ async: false, gfm: true, breaks: false, tokenizer: tildes, renderer: { table: scrollingTable, code: copyableCode } });

const words = new Marked({
  async: false,
  gfm: true,
  breaks: true,
  tokenizer: tildes,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: pictureLink,
    table: scrollingTable,
    code: copyableCode
  }
});

const lines = new Marked({
  async: false,
  gfm: true,
  tokenizer: tildes,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ tokens }) {
      return this.parser.parseInline(tokens);
    },
    image: ({ href, text }) => escapeHtml(pictureWords(text) || href)
  }
});

const books = new Marked({
  async: false,
  gfm: true,
  breaks: false,
  tokenizer: tildes,
  renderer: {
    // A block of typed HTML is a paragraph of its characters, so it is a block that can carry its
    // source line like any other.
    html: ({ text, block }) => (block === true ? `<p>${escapeHtml(text)}</p>` : escapeHtml(text)),
    image: pictureLink,
    table: scrollingTable,
    code: copyableCode
  }
});

// A book, block by block, each block's first element stamped with the line it starts on and a
// heading with its mark. A token's first line is text of the source as it stands, so it is looked
// for from where the previous block began; nothing is counted off the tokens' own lengths, which
// the lexer joins and drops (a link definition leaves no token at all).
function bookHtml(text: string): string {
  const source = text.replace(/\r\n?/g, "\n");
  const headings = new Map(markdownHeadings(source).map((heading) => [heading.line, heading.slug]));
  const starts: number[] = [0];

  for (let at = source.indexOf("\n"); at !== -1; at = source.indexOf("\n", at + 1)) {
    starts.push(at + 1);
  }

  const lineAt = (offset: number): number => {
    let low = 0;
    let high = starts.length - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);

      if (starts[middle]! <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return low + 1;
  };

  let cursor = 0;
  let html = "";

  for (const token of books.lexer(source) as Token[]) {
    const head = token.raw.replace(/^[ \t]*\n/gm, "").split("\n")[0] ?? "";
    const found = head === "" ? -1 : source.indexOf(head, cursor);
    const rendered = books.parser([token]);

    if (found === -1) {
      html += rendered;
      continue;
    }

    cursor = found + head.length;

    const line = lineAt(found);
    const slug = token.type === "heading" ? headings.get(line) : undefined;
    const marks = ` data-line="${line}"${slug === undefined ? "" : ` data-heading="${escapeHtml(slug)}"`}`;

    html += rendered.replace(/^<([a-zA-Z][a-zA-Z0-9]*)/, `<$1${marks}`);
  }

  return html;
}

// A link opens in a tab of its own, and the page it opens is given no hold on the console's
// window. A link to a place inside the same text stays where it is. The hook is put on the first
// time anything is cleaned rather than when the module loads, since a DOMPurify with no DOM under
// it has no hooks to take and the reading below is still worth checking there.
let linksHooked = false;

function hookLinks(): void {
  if (linksHooked) {
    return;
  }

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const href = node.getAttribute("href");

    if (node.tagName === "A" && href !== null && !href.startsWith("#")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  linksHooked = true;
}

// The HTML marked builds, before anything has cleaned it. It is apart from the cleaning only so
// the reading can be checked where there is no DOM; nothing puts it on a screen.
// The words the renderers put on what they draw — a copy button's name, a mark's note — asked of
// the translator the caller handed in, and held only while one text is being built.
let speak: Translate = () => "";

export function markdownHtml(t: Translate, text: string, kind: MarkdownKind): string {
  const before = speak;

  speak = t;

  try {
    return builtHtml(text, kind);
  } finally {
    speak = before;
  }
}

function builtHtml(text: string, kind: MarkdownKind): string {
  if (kind === "line") {
    return lines.parseInline(text.replace(/\s*\n\s*/g, " "), { async: false });
  }

  if (kind === "book") {
    return bookHtml(text);
  }

  return (kind === "document" ? documents : words).parse(text, { async: false });
}

// Markdown to HTML, and the HTML through DOMPurify before any of it reaches the DOM. The escaping
// above already keeps typed HTML out of words, but a link's address is still whatever was written,
// and a document is allowed its HTML outright; a text that can run code in the console runs it as
// the session that is logged in. The pass costs a millisecond on a text of this size, which is
// less than the hole is worth leaving open.
export function renderMarkdown(t: Translate, text: string, kind: MarkdownKind): string {
  hookLinks();

  return DOMPurify.sanitize(markdownHtml(t, text, kind));
}
