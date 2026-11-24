import { halveText, markdownSections } from "./markdown-structure";

// How a text is read for the translator: which language it is written in, and the parts it is cut into and
// joined back from. The console cuts a document and a work order's text by these rules, and reads the parts
// it is handed back by the same ones.

export type TextLanguage = "ko" | "en";

// A text's words outside code: its fenced blocks and its inline code taken out.
function proseOf(text: string): string {
  return text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

// Which language a text is written in, by its letters outside code: a text with few Hangul letters
// against its Latin letters is English, and every other text is Korean.
export function textLanguage(text: string): TextLanguage {
  const prose = proseOf(text);
  const hangul = prose.match(/\p{Script=Hangul}/gu)?.length ?? 0;
  const latin = prose.match(/[A-Za-z]/g)?.length ?? 0;

  return hangul * 4 < latin ? "en" : "ko";
}

// Whether a text stands in a language written in the scripts `letters` matches, by its letters outside code, as the
// gate's translator weighs them (the gate's `docs/api.md`, 「Translations」): those letters weigh at least as much as
// every other letter it holds, a Latin letter weighing a quarter of any other. A text with no letters stands in it.
export function standsInScripts(text: string, letters: RegExp): boolean {
  const prose = proseOf(text);
  const own = prose.match(new RegExp(letters.source, "gu"))?.length ?? 0;
  const latin = prose.match(/[A-Za-z]/g)?.length ?? 0;
  const every = prose.match(/\p{L}/gu)?.length ?? 0;

  return own * 4 >= latin + Math.max(0, every - own - latin) * 4;
}

// A rough count of the tokens a text costs a model: a Hangul syllable or other non-ASCII character
// is most of one, an ASCII character about a third.
function estimatedTokens(text: string): number {
  let ascii = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 128) {
      ascii += 1;
    }
  }

  return Math.ceil((text.length - ascii) * 0.8 + ascii * 0.3);
}

// How much of a text one translation part carries, in estimated tokens. The translation of a part has
// to fit the translator's answer of 2,048 tokens, and a translation into Korean costs more tokens than
// the English it renders. Parts this small are what let the first one show in seconds.
export const TRANSLATION_PART_TOKENS = 750;

function fitted(section: string, budget: number): string[] {
  if (estimatedTokens(section) <= budget) {
    return [section];
  }

  const cut = halveText(section);

  if (cut === null) {
    return [section];
  }

  return [...fitted(cut.halves[0], budget), ...fitted(cut.halves[1], budget)];
}

// A text as the parts the translator is given: its sections, the consecutive ones packed together
// while they fit, a section too large on its own cut at its paragraphs. Joined back, the parts are
// the text.
export function translationParts(text: string, budget = TRANSLATION_PART_TOKENS): string[] {
  const parts: string[] = [];
  let current = "";

  for (const piece of markdownSections(text).flatMap((section) => fitted(section, budget))) {
    if (current !== "" && estimatedTokens(current + piece) > budget) {
      parts.push(current);
      current = "";
    }

    current += piece;
  }

  if (current !== "" || parts.length === 0) {
    parts.push(current);
  }

  return parts;
}

// One part as it stands once read: its translation where there is one, the original where there is
// none. The translator trims what it hands back, so a part that ended the original's line ends the
// translation's too and the parts after it stay blocks of their own.
export function shownPart(source: string, text: string | null): string {
  if (text === null) {
    return source;
  }

  if (source.endsWith("\n") && !text.endsWith("\n")) {
    return text + (source.endsWith("\n\n") ? "\n\n" : "\n");
  }

  return text;
}
