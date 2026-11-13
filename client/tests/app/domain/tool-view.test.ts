import { describe, expect, test } from "bun:test";

import { callCommand, callTopLine, contentLanguage, planOf, resultLook, resultParts, searchLines, singleFileRead } from "../../../apps/web/app/domain/tool-view";

// A tool call as the log draws it (docs/web.md, 「A tool call」): the top line, the command, the result's colouring
// and its fold, and the plan a call lays out.

const args = (value: Record<string, unknown>): string => JSON.stringify(value);

describe("a call's top line", () => {
  test("is its description where it came with one", () => {
    expect(callTopLine("Bash", args({ command: "ls -la", description: "List the files" }))).toBe("List the files");
  });

  test("is its tool and its key argument where it came with none, an MCP tool by its name without its server", () => {
    expect(callTopLine("Read", args({ file_path: "/srv/a/b.ts" }))).toBe("Read /srv/a/b.ts");
    expect(callTopLine("mcp__bmo__brain_recall", args({ query: "what" }))).toBe("brain_recall what");
  });
});

describe("a call's command", () => {
  test("is a shell call's command line, whole, its line breaks kept", () => {
    expect(callCommand("bash", args({ command: "cd /srv\nls", description: "x" }))).toBe("cd /srv\nls");
  });

  test("is any other tool's call written as a command, with no JSON of it", () => {
    const command = callCommand("Grep", args({ pattern: "needle here", path: "src", description: "find" }));

    expect(command).toBe('Grep "needle here" path=src');
    expect(command).not.toContain("{");
  });
});

describe("how a result is coloured", () => {
  test("by the file a file tool names", () => {
    expect(resultLook("Read", args({ file_path: "/srv/a.rs" }), "fn main() {}")).toEqual({ kind: "language", word: "rs" });
  });

  test("by the one file a shell command reads", () => {
    expect(singleFileRead("sed -n 55,100p /srv/docs/a.md")).toBe("/srv/docs/a.md");
    expect(singleFileRead("cat a.ts | head")).toBeNull();
    expect(resultLook("bash", args({ command: "head -n 20 src/main.ts" }), "x")).toEqual({ kind: "language", word: "ts" });
  });

  test("line by line for a search, each line's path and number apart from its text", () => {
    expect(resultLook("bash", args({ command: "rg -n needle" }), "a.ts:3:x")).toEqual({ kind: "lines" });
    expect(searchLines("src/a.ts:12:const x = 1;\nno path here")).toEqual([
      { path: "src/a.ts", number: "12", text: "const x = 1;", word: "ts" },
      { path: null, number: null, text: "no path here", word: null }
    ]);
  });

  test("by what the text is only where no extension is known", () => {
    expect(contentLanguage('{"a": 1}')).toBe("json");
    expect(contentLanguage("diff --git a/x b/x\n--- a/x\n+++ b/x\n+y")).toBe("diff");
    expect(contentLanguage("plain words")).toBeNull();
    expect(resultLook("bash", args({ command: "curl x" }), '{"ok":true}')).toEqual({ kind: "language", word: "json" });
  });
});

describe("a result's fold", () => {
  test("keeps its first five lines and counts the rest", () => {
    expect(resultParts("1\n2\n3\n4\n5\n6\n7\n")).toEqual({ shown: "1\n2\n3\n4\n5", hiddenCount: 2 });
    expect(resultParts("1\n2").hiddenCount).toBe(0);
  });

  test("cuts those lines at a thousand characters, the line the cut fell in counted among the hidden", () => {
    expect(resultParts(`${"a".repeat(600)}\n${"b".repeat(600)}\nc`)).toEqual({ shown: `${"a".repeat(600)}\n${"b".repeat(399)}`, hiddenCount: 2 });
    expect(resultParts(`${"a".repeat(1_000)}\nb`)).toEqual({ shown: "a".repeat(1_000), hiddenCount: 1 });
    expect(resultParts(`${"a".repeat(999)}😀`).shown).toBe("a".repeat(999));
  });
});

describe("a plan a session laid out", () => {
  test("is read by its shape, Claude Code's todos and Codex's plan alike", () => {
    expect(planOf(args({ todos: [{ content: "read", status: "completed", activeForm: "reading" }, { content: "write", status: "in_progress" }, { content: "test", status: "pending" }] }))).toEqual([
      { title: "read", state: "done" },
      { title: "write", state: "running" },
      { title: "test", state: "pending" }
    ]);
    expect(planOf(args({ plan: [{ step: "one", status: "completed" }] }))).toEqual([{ title: "one", state: "done" }]);
    expect(planOf(args({ command: "ls" }))).toBeNull();
  });
});
