import { diffSummary, shownPath } from "./patch";

import type { DiffRow, DiffView } from "./patch";
import type { Translate } from "#shared/wording";

// The change an edit or a write made, read off the call's own arguments (docs/web.md, 「A tool call」): the text it
// replaced and the text it put in, or the whole of what it wrote, drawn as Claude Code draws a change.

// The tools that replace text in a file, and those that write a file whole, by the names the roads give them.
const EDIT_TOOLS = /^(edit|multiedit|multi_edit|str_replace|str_replace_editor)$/i;
const WRITE_TOOLS = /^(write|create_file|write_file)$/i;

// Past this many line pairs a diff is not worked out line by line: what went out stands removed and what came in added.
const DIFF_CELLS = 250_000;

function stringOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function linesOf(text: string): string[] {
  const lines = text.split("\n");

  if (lines.length > 1 && lines.at(-1) === "") lines.pop();

  return lines;
}

/** The rows of one replacement: the lines both sides share stand unmarked, the rest removed or added, in order. */
export function replacementRows(before: string, after: string): DiffRow[] {
  const old = before === "" ? [] : linesOf(before);
  const now = after === "" ? [] : linesOf(after);

  if (old.length * now.length > DIFF_CELLS) {
    return [
      ...old.map((text): DiffRow => ({ kind: "line", mark: "-", old: null, new: null, text })),
      ...now.map((text): DiffRow => ({ kind: "line", mark: "+", old: null, new: null, text }))
    ];
  }

  // The longest run of lines the two share, read back from the end of both.
  const longest: number[][] = Array.from({ length: old.length + 1 }, () => new Array<number>(now.length + 1).fill(0));

  for (let i = old.length - 1; i >= 0; i--) {
    for (let j = now.length - 1; j >= 0; j--) {
      longest[i]![j] = old[i] === now[j] ? longest[i + 1]![j + 1]! + 1 : Math.max(longest[i + 1]![j]!, longest[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < old.length || j < now.length) {
    if (i < old.length && j < now.length && old[i] === now[j]) {
      rows.push({ kind: "line", mark: " ", old: null, new: null, text: old[i]! });
      i++;
      j++;
    } else if (i < old.length && (j === now.length || longest[i + 1]![j]! >= longest[i]![j + 1]!)) {
      // What went out stands before what came in, as a diff writes it.
      rows.push({ kind: "line", mark: "-", old: null, new: null, text: old[i]! });
      i++;
    } else {
      rows.push({ kind: "line", mark: "+", old: null, new: null, text: now[j]! });
      j++;
    }
  }

  return rows;
}

function viewOf(t: Translate, head: string, rows: DiffRow[]): DiffView {
  const added = rows.filter((row) => row.kind === "line" && row.mark === "+").length;
  const removed = rows.filter((row) => row.kind === "line" && row.mark === "-").length;

  return { head, byCommand: false, summary: diffSummary(t, added, removed), added, removed, rows };
}

/** The change an edit or a write call made, from its arguments; null for any other call, or one whose arguments the
 * record cut. */
export function callChange(t: Translate, name: string | null, text: string, root: string | null): DiffView | null {
  const tool = (name ?? "").replace(/^mcp__.*__/, "");
  let args: Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(text);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    args = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const path = stringOf(args.file_path) ?? stringOf(args.path) ?? stringOf(args.filePath);

  if (path === null) return null;

  const shown = shownPath(path, root);

  if (WRITE_TOOLS.test(tool)) {
    const content = stringOf(args.content) ?? stringOf(args.file_text);

    if (content === null) return null;

    return viewOf(t, `Write(${shown})`, linesOf(content).map((line, index): DiffRow => ({ kind: "line", mark: "+", old: null, new: index + 1, text: line })));
  }

  if (!EDIT_TOOLS.test(tool)) return null;

  const pairs = Array.isArray(args.edits)
    ? args.edits.flatMap((edit: unknown) => {
        const one = edit !== null && typeof edit === "object" ? (edit as Record<string, unknown>) : {};
        const before = stringOf(one.old_string) ?? stringOf(one.oldText);
        const after = stringOf(one.new_string) ?? stringOf(one.newText);

        return before === null || after === null ? [] : [{ before, after }];
      })
    : (() => {
        const before = stringOf(args.old_string) ?? stringOf(args.old_str) ?? stringOf(args.oldText);
        const after = stringOf(args.new_string) ?? stringOf(args.new_str) ?? stringOf(args.newText);

        return before === null || after === null ? [] : [{ before, after }];
      })();

  if (pairs.length === 0) return null;

  const rows = pairs.flatMap((pair, index): DiffRow[] => [...(index > 0 ? [{ kind: "gap" } as DiffRow] : []), ...replacementRows(pair.before, pair.after)]);

  return viewOf(t, `Update(${shown})`, rows);
}
