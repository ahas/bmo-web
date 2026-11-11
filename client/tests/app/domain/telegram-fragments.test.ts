import { describe, expect, test } from "bun:test";

import { telegramFragments } from "../../../apps/web/app/domain/telegram-fragments";

import type { TelegramExpression, TelegramFormat } from "../../../apps/web/shared/types";

// The splitting of a message's words by the formatting entities it was sent with (docs/web.md, 「Telegram
// formatting」): every kind, the nesting that overlaps, the merge that shares a run, and the offsets that stand
// in UTF-16 code units beside an emoji. All inputs here are neutral English words, as a test writes them.

const bold = (offset: number, length: number): TelegramFormat => ({ offset, length, kind: "bold" });
const italic = (offset: number, length: number): TelegramFormat => ({ offset, length, kind: "italic" });
const code = (offset: number, length: number): TelegramFormat => ({ offset, length, kind: "code" });
const pre = (offset: number, length: number, language?: string): TelegramFormat => ({ offset, length, kind: "pre", ...(language === undefined ? {} : { language }) });
const quote = (offset: number, length: number): TelegramFormat => ({ offset, length, kind: "quote" });
const fold = (offset: number, length: number): TelegramFormat => ({ offset, length, kind: "expandable_quote" });
const link = (offset: number, length: number, url: string): TelegramFormat => ({ offset, length, kind: "link", url });
const spoiler = (offset: number, length: number): TelegramFormat => ({ offset, length, kind: "spoiler" });

describe("no formatting", () => {
  test("the whole text stands as one words run", () => {
    expect(telegramFragments("just words", [], [])).toEqual([{ kind: "words", text: "just words" }]);
  });

  test("an entity outside the words or of no length is left unread", () => {
    const fragments = telegramFragments("abc", [bold(0, 0), bold(1, 99), bold(-2, 2)], []);

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.text).toBe("abc");
  });
});

describe("the simple styles", () => {
  test("each kind names its own flag", () => {
    const fragments = telegramFragments("xyz", [bold(0, 1), { offset: 1, length: 1, kind: "italic" }, { offset: 2, length: 1, kind: "underline" }], []);

    expect(fragments.map((one) => [one.text, one.bold, one.italic, one.underline])).toEqual([
      ["x", true, false, false],
      ["y", false, true, false],
      ["z", false, false, true]
    ]);
  });

  test("overlapping bold and italic stand on the run where both reach", () => {
    const fragments = telegramFragments("abcdef", [bold(0, 6), italic(2, 3)], []);

    expect(fragments.map((one) => [one.text, one.bold, one.italic])).toEqual([
      ["ab", true, false],
      ["cde", true, true],
      ["f", true, false]
    ]);
  });

  test("neighbours under one style join into a single run", () => {
    const fragments = telegramFragments("hello world", [bold(0, 5), bold(6, 5)], []);

    expect(fragments.map((one) => [one.text, one.bold])).toEqual([
      ["hello", true],
      [" ", false],
      ["world", true]
    ]);
  });
});

describe("code", () => {
  test("an inline code run stands with its own flag", () => {
    const fragments = telegramFragments("say x now", [code(4, 1)], []);

    expect(fragments[1]).toMatchObject({ kind: "words", text: "x", code: true });
    expect(fragments[1]?.bold).toBe(false);
  });

  test("a pre is a block of its own, with its language where its fence gave one", () => {
    const [before, block, after] = telegramFragments("see:\nlet x = 1\ndone", [pre(5, 9, "rust")], []);

    expect(before?.text).toBe("see:");
    expect(block).toEqual({ kind: "pre", text: "let x = 1", language: "rust" });
    expect(after?.text).toBe("done");
  });

  test("a pre with no language stands without one", () => {
    const [block] = telegramFragments("plain", [pre(0, 5)], []);

    expect(block).toEqual({ kind: "pre", text: "plain" });
  });
});

describe("quotes", () => {
  test("a blockquote gathers its lines into one block", () => {
    const fragments = telegramFragments("before\nq1\nq2\nafter", [quote(7, 5)], []);

    expect(fragments[0]?.text).toBe("before");
    expect(fragments[1]).toMatchObject({ kind: "quote", expandable: false });
    expect(fragments[1]?.children?.map((one) => one.text)).toEqual(["q1\nq2"]);
    expect(fragments[2]?.text).toBe("after");
  });

  test("an expandable quote says it may fold, and holds its words", () => {
    const [block] = telegramFragments("folded text", [fold(0, 11)], []);

    expect(block).toMatchObject({ kind: "quote", expandable: true });
    expect(block?.children?.[0]?.text).toBe("folded text");
  });

  test("inline formatting inside a quote stands within it", () => {
    const [block] = telegramFragments("hi *b*", [quote(0, 6), bold(3, 3)], []);

    expect(block?.kind).toBe("quote");
    expect(block?.children?.map((one) => [one.text, one.bold])).toEqual([
      ["hi ", false],
      ["*b*", true]
    ]);
  });
});

describe("a spoiler and a text link", () => {
  test("a spoiler holds its words as a child run", () => {
    const [before, held] = telegramFragments("see secret!", [spoiler(4, 7)], []);

    expect(before?.text).toBe("see ");
    expect(held?.kind).toBe("spoiler");
    expect(held?.children).toEqual([{ kind: "words", text: "secret!", bold: false, italic: false, underline: false, strike: false, code: false }]);
    expect(held?.slot).toEqual(expect.any(Number));
  });

  test("a text link opens the address it carries, nested inside a spoiler over it", () => {
    const [held] = telegramFragments("docs", [spoiler(0, 4), link(0, 4, "https://example.com")], []);

    expect(held?.kind).toBe("spoiler");
    expect(held?.children?.[0]).toMatchObject({ kind: "link", url: "https://example.com" });
    expect(held?.children?.[0]?.children?.[0]?.text).toBe("docs");
  });

  test("two spoilers each take their own state slot", () => {
    const fragments = telegramFragments("1a2b", [spoiler(1, 1), spoiler(3, 1)], []);
    const a = fragments[1];
    const b = fragments[3];

    expect(a?.kind).toBe("spoiler");
    expect(b?.kind).toBe("spoiler");
    expect(a?.slot).not.toBe(b?.slot);
  });
});

describe("custom emoji", () => {
  const attachment: TelegramExpression["attachment"] = { id: 0, kind: "sticker", name: "emoji-1.webp", bytes: 4, type: "image/webp", available: true };

  test("an emoji stands as its own fragment between the words", () => {
    const expressions: TelegramExpression[] = [{ offset: 3, length: 2, attachment }];
    const fragments = telegramFragments("hi 🏃 there", [], expressions);

    expect(fragments.map((one) => one.kind)).toEqual(["words", "emoji", "words"]);
    expect(fragments[1]?.attachment).toBe(attachment);
  });

  test("a bold run split by an emoji keeps its style on both sides", () => {
    const expressions: TelegramExpression[] = [{ offset: 3, length: 2, attachment }];
    const fragments = telegramFragments("hi 🏃 there", [bold(0, 11)], expressions);

    expect(fragments.map((one) => [one.kind, one.bold])).toEqual([
      ["words", true],
      ["emoji", undefined],
      ["words", true]
    ]);
  });
});

describe("UTF-16 code units", () => {
  test("offsets land around astral characters, and a cut never splits a pair", () => {
    // A face of two code units before the bold word: the entity offset counts the pair as one character but
    // two code units, so the cut lands on the pair's boundary and the words stay whole.
    const fragments = telegramFragments("\u{1F600}bold", [bold(2, 4)], []);

    expect(fragments.map((one) => [one.text, one.bold])).toEqual([
      ["\u{1F600}", false],
      ["bold", true]
    ]);
  });

  test("an entity that would cut a pair in two is not drawn split", () => {
    // An entity covering only the high surrogate of the face: no piece stands in its exact range once the cut
    // moves past the pair, so the whole text stands as one unstyled run.
    const fragments = telegramFragments("\u{1F600}x", [bold(0, 1)], []);

    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.bold).toBe(false);
  });
});
