import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { callChange, replacementRows } from "../../../apps/web/app/domain/call-change";

// The change an edit or a write made, read off the call's arguments (docs/web.md, 「A tool call」).

describe("a change read off a call's arguments", () => {
  test("an edit marks what went out and came in, and keeps what both sides share", () => {
    const rows = replacementRows("a\nb\nc", "a\nB\nc");

    expect(rows.map((row) => (row.kind === "line" ? `${row.mark}${row.text}` : "gap"))).toEqual([" a", "-b", "+B", " c"]);
  });

  test("an edit is an update of its file, relative to the checkout, with its counts", () => {
    const change = callChange(wording, "edit", JSON.stringify({ file_path: "/repo/docs/a.md", old_string: "x\ny", new_string: "x\nz\nw" }), "/repo");

    expect(change?.head).toBe("Update(docs/a.md)");
    expect([change?.added, change?.removed]).toEqual([2, 1]);
  });

  test("a write adds every line, and several edits stand apart", () => {
    expect(callChange(wording, "Write", JSON.stringify({ file_path: "/repo/b.ts", content: "one\ntwo\n" }), "/repo")?.added).toBe(2);
    expect(callChange(wording, "MultiEdit", JSON.stringify({ file_path: "/r/c", edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: "d" }] }), null)?.rows.some((row) => row.kind === "gap")).toBe(true);
  });

  test("any other call, and one whose arguments the record cut, has none", () => {
    expect(callChange(wording, "bash", JSON.stringify({ command: "ls" }), null)).toBeNull();
    expect(callChange(wording, "edit", '{"file_path":"/a","old_string":"x', null)).toBeNull();
  });
});
