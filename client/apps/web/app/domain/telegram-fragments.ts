import type { MessageAttachment, TelegramExpression, TelegramFormat } from "#shared/types";

// The formatting a message's words were sent with, made into the fragments a bubble stands (docs/web.md,
// 「Telegram formatting」). The words are cut wherever any entity begins or ends, the pieces joined back into
// runs that share one formatting, and the runs nested as the entities nest: a spoiler or a link holding what
// stands under it, a pre or a quote standing as a block of its own. Where malformed data would cut a pair of
// surrogates in two, the cut moves past the pair instead, and a custom emoji whose range no piece stands in
// exactly is left as its words.

export interface TelegramFragment {
  // words: a plain run, styled inline. emoji: a custom emoji. spoiler, link: an inline press holding fragments.
  // pre, quote: a block.
  kind: "words" | "emoji" | "spoiler" | "link" | "pre" | "quote";
  // The run's words, as written: whole for words, pre and emoji, empty for a holder.
  text: string;
  // The emoji a custom emoji fragment draws.
  attachment?: MessageAttachment;
  // The address a link opens.
  url?: string;
  // The language a pre's fence gave.
  language?: string;
  // Whether a quote may fold and unfold on a press.
  expandable?: boolean;
  // The state slot a spoiler or an expandable quote toggles in.
  slot?: number;
  // The letter styles a words run stands under.
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  // What stands inside a spoiler, a link or a quote.
  children?: TelegramFragment[];
}

const BLOCKS = new Set(["pre", "quote", "expandable_quote"]);

interface Segment {
  text: string;
  // The formats covering the segment whole, outermost first.
  coverings: TelegramFormat[];
  emoji: MessageAttachment | null;
}

/** The fragments the bubble stands, in order. */
export function telegramFragments(
  text: string,
  formats: readonly TelegramFormat[],
  expressions: readonly TelegramExpression[]
): TelegramFragment[] {
  const held = formats
    .filter((one) => isWhole(one.offset) && isWhole(one.length) && one.length > 0 && one.offset >= 0 && one.offset + one.length <= text.length && (one.kind !== "link" || one.url !== undefined))
    .sort((a, b) => a.offset - b.offset || b.length - a.length);
  const emojis = keptExpressions(expressions, text.length);

  if (held.length === 0 && emojis.length === 0) return [{ kind: "words", text }];

  const points = cuts(text, [...held, ...emojis]);
  const segments: Segment[] = [];

  for (let at = 0; at + 1 < points.length; at++) {
    const start = points[at]!;
    const end = points[at + 1]!;
    const emoji = emojis.find((one) => one.offset === start && one.offset + one.length === end);

    segments.push({
      text: text.slice(start, end),
      coverings: held.filter((one) => one.offset <= start && end <= one.offset + one.length),
      emoji: emoji?.attachment ?? null
    });
  }

  return blocks(segments, { slot: 0 });
}

function isWhole(value: number): boolean {
  return Number.isSafeInteger(value);
}

// The expressions the drawing may place: none standing outside the words, none overlapping the one before.
function keptExpressions(expressions: readonly TelegramExpression[], length: number): TelegramExpression[] {
  const kept: TelegramExpression[] = [];
  let end = 0;

  for (const one of [...expressions].sort((a, b) => a.offset - b.offset)) {
    if (!isWhole(one.offset) || !isWhole(one.length) || one.offset < end || one.length <= 0 || one.offset + one.length > length) continue;

    kept.push(one);
    end = one.offset + one.length;
  }

  return kept;
}

// Every offset a piece of the words may begin or end at, in order, with the ends of the words: cuts that would
// fall inside a pair of surrogates move past the pair, so no piece ever stands with half an emoji.
function cuts(text: string, placed: readonly { offset: number; length: number }[]): number[] {
  const wanted = new Set<number>([0, text.length]);

  for (const one of placed) {
    wanted.add(one.offset);
    wanted.add(one.offset + one.length);
  }

  const points: number[] = [];

  for (const point of [...wanted].sort((a, b) => a - b)) {
    const at = isSplit(text, point) ? point + 1 : point;

    if (points.length === 0 || points[points.length - 1] !== at) points.push(at);
  }

  return points;
}

// Whether the offset between two code units splits a pair of surrogates.
function isSplit(text: string, point: number): boolean {
  return point > 0 && point < text.length && isHigh(text.charCodeAt(point - 1)) && isLow(text.charCodeAt(point));
}

function isHigh(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLow(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

// The pieces of one stretch, grouped into the blocks the outermost block entity stands, with everything
// between blocks drawn as inline runs.
function blocks(segments: readonly Segment[], state: { slot: number }): TelegramFragment[] {
  const fragments: TelegramFragment[] = [];
  let at = 0;

  while (at < segments.length) {
    const block = blockOf(segments[at]!);

    if (block === undefined) {
      const start = at;

      while (at < segments.length && blockOf(segments[at]!) === undefined) at++;

      fragments.push(...inline(segments.slice(start, at), state));
      continue;
    }

    const start = at;

    while (at < segments.length && blockOf(segments[at]!) === block) at++;

    const run = segments.slice(start, at);
    const words = run.map((one) => one.text).join("");

    if (block.kind === "pre") {
      fragments.push({ kind: "pre", text: words, ...(block.language === undefined ? {} : { language: block.language }) });
      continue;
    }

    fragments.push({
      kind: "quote",
      text: "",
      expandable: block.kind === "expandable_quote",
      slot: state.slot++,
      children: blocks(run.map((one) => ({ ...one, coverings: one.coverings.filter((format) => format !== block) })), state)
    });
  }

  return trimmed(fragments);
}

// A block already ends its own line, so the one line break the words carry straight before or after it is not
// drawn a second time; any further blank the writer left stands.
function trimmed(fragments: TelegramFragment[]): TelegramFragment[] {
  for (let at = 1; at < fragments.length; at++) {
    const block = fragments[at]!;

    if (block.kind !== "pre" && block.kind !== "quote") continue;

    const before = fragments[at - 1]!;

    if (before.kind === "words" && before.text.endsWith("\n")) before.text = before.text.slice(0, -1);

    const after = fragments[at + 1];

    if (after !== undefined && after.kind === "words" && after.text.startsWith("\n")) after.text = after.text.slice(1);
  }

  return fragments.filter((one) => one.kind !== "words" || one.text !== "");
}

// The outermost block format over a piece, if any. Neighbouring pieces of one block stand in the same entity
// object, which is how the run of a block is recognised.
function blockOf(segment: Segment): TelegramFormat | undefined {
  return segment.coverings.find((one) => BLOCKS.has(one.kind));
}

// A run of pieces with no block over them: neighbours standing under the same formatting join into one words
// fragment, every other piece standing as its own fragment, wrapped by its spoilers and links.
function inline(segments: readonly Segment[], state: { slot: number }): TelegramFragment[] {
  const fragments: TelegramFragment[] = [];
  let joined: TelegramFragment | null = null;
  let joinedCoverings: TelegramFormat[] | null = null;

  for (const segment of segments) {
    const plain = segment.emoji === null && segment.coverings.every((one) => one.kind === "bold" || one.kind === "italic" || one.kind === "underline" || one.kind === "strikethrough");

    if (joined !== null && plain && sameCoverings(joinedCoverings!, segment.coverings)) {
      joined.text += segment.text;
      continue;
    }

    const fragment = holder(segment, state);

    fragments.push(fragment);
    joined = plain && fragment.kind === "words" ? fragment : null;
    joinedCoverings = plain ? segment.coverings : null;
  }

  return fragments;
}

function sameCoverings(a: readonly TelegramFormat[], b: readonly TelegramFormat[]): boolean {
  return a.length === b.length && a.every((one, at) => one === b[at]);
}

// One piece as a fragment: the words leaf with its letter styles, wrapped by every spoiler and link over it,
// the outermost standing outermost.
function holder(segment: Segment, state: { slot: number }): TelegramFragment {
  let fragment: TelegramFragment =
    segment.emoji !== null
      ? { kind: "emoji", text: segment.text, attachment: segment.emoji }
      : {
          kind: "words",
          text: segment.text,
          bold: has(segment, "bold"),
          italic: has(segment, "italic"),
          underline: has(segment, "underline"),
          strike: has(segment, "strikethrough"),
          code: has(segment, "code")
        };

  for (const format of [...segment.coverings].reverse()) {
    if (format.kind === "spoiler") fragment = { kind: "spoiler", text: "", slot: state.slot++, children: [fragment] };
    if (format.kind === "link") fragment = { kind: "link", text: "", url: format.url ?? "", children: [fragment] };
  }

  return fragment;
}

function has(segment: Segment, kind: TelegramFormat["kind"]): boolean {
  return segment.coverings.some((one) => one.kind === kind);
}
