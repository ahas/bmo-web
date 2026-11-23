import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { PASTE_ENTRY_CHARS } from "../../../apps/web/shared/config";
import { composedText, isPasteEntry, pastedLabel, pastedOf, readPasted, standingPastes, withoutMark } from "../../../apps/web/app/domain/pasted";
import KO from "../../fixtures/app/domain/pasted.test.ko.json";

describe("a long paste in the room prompt", () => {
  test("stands as a mark from the threshold on, and stays in the box below it", () => {
    expect(PASTE_ENTRY_CHARS).toBe(2_000);
    expect(isPasteEntry(KO.line_11.repeat(1_999))).toBe(false);
    expect(isPasteEntry(KO.line_12.repeat(2_000))).toBe(true);
  });

  test("is labelled by the head of its first line with words and by its length", () => {
    const pasted = pastedOf(wording, `\n\n  The assembly is done and the tree is clean. Here is the record.\n${"x".repeat(8_000)}`);

    expect(pastedLabel(wording, pasted)).toEqual({
      name: KO.line_19,
      head: "The assembly is done and the tree is cle…",
      size: `${pasted.text.length.toLocaleString("ko-KR")}${KO.line_21}`
    });
  });

  test("is marked with the lowest number the box does not already hold", () => {
    const first = pastedOf(wording, "a".repeat(2_500));
    const second = pastedOf(wording, "b", [first]);

    expect(first.mark).toBe(KO.line_29);
    expect(second.key).toBe("paste2");
    expect(pastedOf(wording, "c", [second]).key).toBe("paste1");
  });
});

describe("sending a box that holds marks", () => {
  test("puts each paste back where its mark stands, between the typed words", () => {
    const first = pastedOf(wording, KO.line_37);
    const second = pastedOf(wording, KO.line_38, [first]);
    const typed = `${KO.line_39}${second.mark}${KO.line_39_2}${first.mark}${KO.line_39_3}`;

    expect(composedText(typed, [first, second])).toBe(KO.line_41);
  });

  test("leaves a mark with no paste behind it as it is, and trims the whole", () => {
    expect(composedText(KO.line_45, [])).toBe(KO.line_45_2);
  });

  test("drops a paste whose mark was deleted, and brings it back with the mark", () => {
    const first = pastedOf(wording, KO.line_49);
    const second = pastedOf(wording, KO.line_50, [first]);

    expect(standingPastes(`${second.mark}`, [first, second])).toEqual([second]);
    expect(composedText(`${second.mark}`, standingPastes(`${second.mark}`, [first, second]))).toBe(KO.line_53);
    expect(standingPastes(`${first.mark}${second.mark}`, [first, second])).toEqual([first, second]);
  });

  test("removing an entry takes its mark out of the box", () => {
    const first = pastedOf(wording, KO.line_58);

    expect(withoutMark(`${KO.line_60}${first.mark}${KO.line_60_2}`, first)).toBe(KO.line_60_3);
  });
});

describe("a paste kept with the draft", () => {
  test("reads back only what has the shape of a paste", () => {
    const kept = pastedOf(wording, KO.line_66);

    expect(readPasted([kept, { key: 1 }, null, "x"])).toEqual([kept]);
    expect(readPasted("nope")).toEqual([]);
  });
});
