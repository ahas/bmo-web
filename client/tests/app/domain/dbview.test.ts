import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import {
  cellPreview,
  cellText,
  jsonFields,
  jsonSummary,
  clampPage,
  cutNote,
  isCut,
  isDbMode,
  isNull,
  lengthNote,
  nextSort,
  oneLine,
  openingTable,
  pageCount,
  pageLabel,
  resultNote,
  sortIcon,
  tableChoices
} from "../../../apps/web/app/domain/dbview";

import type { DbTable } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/dbview.test.ko.json";

// What the DB screen says about what it is showing. Everything here exists so that a page of a
// table is never mistaken for the table, and the head of a value is never mistaken for the value.

describe("picking an order", () => {
  test("a column not sorted by is read upwards first", () => {
    expect(nextSort(null, "sent_at")).toEqual({ column: "sent_at", descending: false });
    expect(nextSort({ column: "id", descending: true }, "sent_at")).toEqual({
      column: "sent_at",
      descending: false
    });
  });

  test("pressing the same column again reads it downwards", () => {
    expect(nextSort({ column: "sent_at", descending: false }, "sent_at")).toEqual({
      column: "sent_at",
      descending: true
    });
  });

  test("and a third press gives the table its own order back", () => {
    expect(nextSort({ column: "sent_at", descending: true }, "sent_at")).toBeNull();
  });

  test("the mark on a column says which of the three it stands in", () => {
    expect(sortIcon(null, "id")).toBe("i-material-symbols-unfold-more");
    expect(sortIcon({ column: "id", descending: false }, "id")).toBe("i-material-symbols-keyboard-arrow-up");
    expect(sortIcon({ column: "id", descending: true }, "id")).toBe("i-material-symbols-keyboard-arrow-down");
    expect(sortIcon({ column: "id", descending: true }, "title")).toBe("i-material-symbols-unfold-more");
  });
});

describe("where in a table the reader is", () => {
  test("is counted in whole pages", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(113_953, 50)).toBe(2_280);
  });

  test("a table with nothing in it is still one page: there is a table there", () => {
    expect(pageLabel(wording, 1, 0, 50)).toBe(wording("db.label.page", { page: "1", pages: "1", total: "0" }));
  });

  test("never runs past either end, however it is asked for", () => {
    expect(clampPage(0, 500, 50)).toBe(1);
    expect(clampPage(99, 500, 50)).toBe(10);
    expect(clampPage(3, 500, 50)).toBe(3);
  });

  test("reads as which page of how many, and of how many rows", () => {
    expect(pageLabel(wording, 3, 113_953, 50)).toBe(wording("db.label.page", { page: "3", pages: "2,280", total: "113,953" }));
  });
});

describe("one value on the screen", () => {
  test("SQL NULL is nothing rather than an empty value", () => {
    expect(isNull(null)).toBe(true);
    expect(isNull({ text: "", cut: false, length: 0 })).toBe(false);
    expect(cellText(null)).toBe("NULL");
  });

  test("a value with the whole of it in hand is not marked as cut", () => {
    const whole = { text: KO.line_88, cut: false, length: 2 };

    expect(isCut(whole)).toBe(false);
    expect(cutNote(wording, whole)).toBe("");
    expect(cellPreview(wording, whole)).toBe(KO.line_92);
  });

  test("a value the screen holds only the head of says how much there is", () => {
    const cut = { text: KO.line_96.repeat(400), cut: true, length: 4_120 };

    expect(isCut(cut)).toBe(true);
    expect(cutNote(wording, cut)).toBe(wording("db.label.cut_length", { n: "4,120" }));
    expect(cellPreview(wording, cut).endsWith("…")).toBe(true);
  });

  test("reads as one line in a list, however many the value had", () => {
    expect(oneLine(KO.line_104)).toBe(KO.line_104_2);
    expect(cellPreview(wording, { text: KO.line_105, cut: false, length: 3 })).toBe(KO.line_105_2);
  });

  test("the one-row view says a length only where the length is news", () => {
    expect(lengthNote(wording, null)).toBe("");
    expect(lengthNote(wording, { text: KO.line_110, cut: false, length: 2 })).toBe("");
    expect(lengthNote(wording, { text: KO.line_111, cut: false, length: 5_000 })).toBe(KO.line_111_2);
  });
});

describe("which table is open", () => {
  const tables: DbTable[] = [
    { name: "agent_log", rows: 10_277, hasRowid: true },
    { name: "messages", rows: 113_953, hasRowid: true }
  ];

  test("each is offered with how much is in it", () => {
    expect(tableChoices(tables)).toEqual([
      { value: "agent_log", label: "agent_log (10,277)" },
      { value: "messages", label: "messages (113,953)" }
    ]);
  });

  test("the screen opens where it was left", () => {
    expect(openingTable(tables, "messages")).toBe("messages");
  });

  test("a table that is no longer there is not held on to", () => {
    expect(openingTable(tables, "gone")).toBe("agent_log");
    expect(openingTable(tables, null)).toBe("agent_log");
    expect(openingTable([], "messages")).toBeNull();
  });
});

describe("what a typed query answered with", () => {
  test("is said in rows and in the time it took", () => {
    expect(resultNote(wording, 37, false, 12)).toBe(KO.line_141);
  });

  test("an answer that stopped at the cap says so rather than reading as the whole of it", () => {
    expect(resultNote(wording, 500, true, 240)).toBe(wording("db.label.result_cut", { rows: "500", ms: "240" }));
  });
});

describe("which of the two sides the screen is on", () => {
  test("is one of the two and nothing else, whatever was stored", () => {
    expect(isDbMode("table")).toBe(true);
    expect(isDbMode("sql")).toBe(true);
    expect(isDbMode("rows")).toBe(false);
    expect(isDbMode(null)).toBe(false);
  });
});

// A JSON value is never shown as its text (docs/web.md, 「DB screen」): a list cell says what it holds, and the opened
// row stands its named fields.
describe("a JSON value", () => {
  const object = { text: '{"role":"worker","place":{"line":"a"},"kept":true,"tags":[]}', cut: false, length: 60, shape: "object" as const, count: 4, keys: ["role", "place", "kept", "tags"], json: { role: "worker", place: { line: "a" }, kept: true, tags: [] } };

  test("stands in a list cell as its count of fields and their first names, a list as its count of members", () => {
    expect(cellPreview(wording, object)).toBe(wording("db.label.json_object", { n: "4", keys: "role, place, kept, tags" }));
    expect(jsonSummary(wording, { text: "[1,2,3]", cut: false, length: 7, shape: "list", count: 3, keys: [] })).toBe(wording("db.label.json_list", { n: "3" }));
    expect(cellPreview(wording, object)).not.toMatch(/[{}[\]"]/);
  });

  test("stands in the opened row as its named fields, a nested one under its parent, a yes as a state word", () => {
    expect(jsonFields(wording, object.json)).toEqual([
      { label: "role", value: "worker" },
      { label: "place › line", value: "a" },
      { label: "kept", value: wording("db.label.json_yes") },
      { label: "tags", value: wording("db.label.json_none") }
    ]);
  });
});
