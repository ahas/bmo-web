import { convertMarkdown } from "bmo-text/markdown";

import { linkParts } from "../../shared/links";

// A message's markdown as the chat it went out to shows it (docs/web.md, 「A bubble reads as its message does in
// the chat」): the base library's reading of the markdown into the chat's markup, which is the reading the words
// were sent with, made into the HTML a bubble stands as. It builds HTML and cleans none of it; the renderer that
// asks for it cleans it with everything else it draws (see domain/markdown).
//
// The module stands apart from the renderer because the reading is the base library's WebAssembly build, which
// only a room's bubble needs: it is fetched the first time one does.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const READ: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"" };

function escaped(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

// The words as they were before the reading escaped them for its markup.
function read(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot);/g, (entity) => READ[entity]!);
}

// A run of the markup's words with every bare web address in it a link, as the chat makes one of it.
function linked(words: string): string {
  return linkParts(read(words))
    .map((part) => (part.href === null ? escaped(part.text) : `<a href="${escaped(part.href)}">${escaped(part.text)}</a>`))
    .join("");
}

// A code block whole, or any one tag of the markup: between them stand the words, escaped as the reading left
// them.
const PIECE = /<pre>(?:<code(?: class="language-([^"]*)")?>)?([\s\S]*?)(?:<\/code>)?<\/pre>|<(\/?)([a-z][a-z0-9-]*)\b[^>]*>/g;

/** What draws a code block: the block's own HTML and the language its fence named, into the box it stands in. */
export type CodeBox = (block: string, language: string) => string;

/**
 * The HTML of a message written in markdown, as its chat shows it. A code block is handed to `codeBox`, so it
 * stands as every other code block of the console does; a spoiler is a covered span a press uncovers; a bare
 * address is a link. A block — a quote, a code block — ends its own line, so the line break the markup writes
 * beside it is not drawn a second time.
 */
export function messageMarkup(text: string, codeBox: CodeBox): string {
  const converted = convertMarkdown(text);

  if (!converted.formatted) {
    return linked(escaped(converted.plain));
  }

  const markup = converted.markup.replace(/\n?(<blockquote\b[^>]*>|<pre>)/g, "$1").replace(/(<\/blockquote>|<\/pre>)\n?/g, "$1");
  let html = "";
  let at = 0;
  // How deep the words stand inside a link or inline code, where an address is left as it is written.
  let literal = 0;

  for (const piece of markup.matchAll(PIECE)) {
    const words = markup.slice(at, piece.index);

    html += literal > 0 ? words : linked(words);
    at = piece.index + piece[0].length;

    if (piece[2] !== undefined) {
      const language = piece[1] ?? "";
      const named = language === "" ? "" : ` class="language-${language}"`;

      html += codeBox(`<pre><code${named}>${piece[2]}\n</code></pre>`, read(language));

      continue;
    }

    const closing = piece[3] === "/";

    if (piece[4] === "tg-spoiler") {
      html += closing ? "</span>" : '<span class="markdown-spoiler" data-spoiler role="button" tabindex="0">';

      continue;
    }

    // Inside a link or inline code an address is what was written, never a link of its own.
    if (piece[4] === "a" || piece[4] === "code") {
      literal = Math.max(0, literal + (closing ? -1 : 1));
    }

    html += piece[0];
  }

  const rest = markup.slice(at);

  return html + (literal > 0 ? rest : linked(rest));
}
