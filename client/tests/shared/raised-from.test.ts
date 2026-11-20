import { describe, expect, test } from "bun:test";

import { fromTodoLabel, noteStrands, sourcesOf, STRAND_WORDS_LIMIT, takesUpWhole } from "../../apps/web/shared/raised-from";

// The label a line raised from notes names them in, as bmo-job's `todo --add --from-todo` writes it, and the strands a
// note is read as (docs/web.md, the TODO panel's section, on a note resolving on its own).

describe("a note's strands", () => {
  test("are the items of its top-level numbered lists, by the number written and their first line", () => {
    const note = "Left behind:\n\n1. Owner's part: the password\n   for the mail account\n2. Host work: the backup\n\n- a bullet is no strand\n\n4. A list starting at four";

    expect(noteStrands(note)).toEqual([
      { number: 1, text: "Owner's part: the password" },
      { number: 2, text: "Host work: the backup" },
      { number: 4, text: "A list starting at four" }
    ]);
  });

  test("a strand whose first line runs long is named by its first words, cut at a word's end", () => {
    const words = "word ".repeat(40).trim();
    const unbroken = "x".repeat(STRAND_WORDS_LIMIT + 10);
    const [named, solid] = noteStrands(`1. ${words}\n2. ${unbroken}`);

    expect(named!.text).toBe(`${words.slice(0, words.lastIndexOf(" ", STRAND_WORDS_LIMIT))}…`);
    expect(named!.text.length).toBeLessThanOrEqual(STRAND_WORDS_LIMIT + 1);
    expect(solid!.text).toBe(`${"x".repeat(STRAND_WORDS_LIMIT)}…`);
  });

  test("a note with no numbered list stands none, being one strand", () => {
    expect(noteStrands("The rest is prose.\n\n- and a bullet")).toEqual([]);
  });
});

describe("the from-todo label", () => {
  test("names each strand once, and a note taken whole by its item alone", () => {
    expect(fromTodoLabel([{ item: 7, strand: 2 }, { item: 7, strand: 3 }, { item: 7, strand: 2 }, { item: 9, strand: null }])).toBe("7:2,7:3,9");
    expect(fromTodoLabel([{ item: 7, strand: 2 }, { item: 7, strand: null }])).toBe("7");
  });

  test("is read back into its notes, an entry that names no item or no strand number passed over", () => {
    expect(sourcesOf("7:2, 9 ,x,8:,0,5:a,6:1:2,3:4")).toEqual([
      { item: 7, strand: 2 },
      { item: 9, strand: null },
      { item: 3, strand: 4 }
    ]);
    expect(sourcesOf(undefined)).toEqual([]);
  });
});

describe("whether lines take up a note whole", () => {
  const strands = [{ number: 1, text: "one" }, { number: 2, text: "two" }];

  test("every numbered strand named, the note named whole, or a note of no numbered strands", () => {
    expect(takesUpWhole(strands, [{ item: 7, strand: 1 }, { item: 7, strand: 2 }])).toBe(true);
    expect(takesUpWhole(strands, [{ item: 7, strand: null }])).toBe(true);
    expect(takesUpWhole([], [{ item: 7, strand: 3 }])).toBe(true);
  });

  test("a strand nobody named keeps it standing", () => {
    expect(takesUpWhole(strands, [{ item: 7, strand: 2 }])).toBe(false);
  });
});
