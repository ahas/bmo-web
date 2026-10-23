import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { buildLog, GENERIC_TOOL_ICON, kindLook, lineLook, logRuns, openedRun, resultPreview, runStep, toolArguments, toolCall, toolChip } from "../../../apps/web/app/domain/log";

import type { AgentLogKind, AgentLogLine, AgentLogState } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/log.test.ko.json";

// The host's zone, which a run's clock is read in.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

interface LineFields {
  id: number;
  kind: AgentLogKind;
  run?: string;
  name?: string | null;
  parent?: string | null;
  ref?: string | null;
  text?: string;
  state?: AgentLogState | null;
}

function line({ id, kind, run = "gate:1", name = null, parent = null, ref = null, text = "", state = null }: LineFields): AgentLogLine {
  // The tool as the server hands it with the line (`client/server/utils/agentlog.ts`).
  const tool = name === null || (kind !== "tool" && kind !== "tool-result") ? null : { name: name.replace(/^mcp__[^_]+(?:_[^_]+)*__/, ""), icon: null };

  return { id, agent: "worker", run, chatId: -1001, at: 100 + id, kind, name, tool, parent, ref, state, truncated: false, text, patches: [], patchesMore: 0 };
}

describe("buildLog", () => {
  test("a result sits under the call it answers rather than beside it", () => {
    const rows = buildLog([
      line({ id: 1, kind: "tool", name: "Read", ref: "t1" }),
      line({ id: 2, kind: "tool-result", name: "Read", ref: "t1", text: KO.line_31 }),
      line({ id: 3, kind: "text", text: KO.line_32 })
    ]);

    expect(rows.map((row) => row.key)).toEqual(["1", "3"]);
    expect(rows[0]?.results.map((result) => result.text)).toEqual([KO.line_36]);
  });

  test("a result whose call has scrolled out of the window stands on its own", () => {
    const rows = buildLog([line({ id: 9, kind: "tool-result", ref: "gone", text: KO.line_40 })]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.results).toEqual([]);
    expect(rows[0]?.depth).toBe(0);
  });

  test("a co-worker's branch is indented one step under the Task call it came from", () => {
    const rows = buildLog([
      line({ id: 1, kind: "tool", name: "Task(scout)", ref: "task1" }),
      line({ id: 2, kind: "tool", name: "Grep", parent: "task1", ref: "t2" }),
      line({ id: 3, kind: "tool-result", parent: "task1", ref: "t2", text: KO.line_51 }),
      line({ id: 4, kind: "text", text: KO.line_52 })
    ]);

    expect(rows.map((row) => row.depth)).toEqual([0, 1, 0]);
    expect(rows[1]?.results.map((result) => result.text)).toEqual([KO.line_56]);
    expect(rows[2]?.key).toBe("4");
  });

  test("an empty log has no rows at all", () => {
    expect(buildLog([])).toEqual([]);
  });
});

// Each run of a log is one step of the progress stepper (docs/web.md, 「Agent screen」).
describe("a log's runs as steps", () => {
  test("gather each run's lines by its name, in the order the runs began, side-by-side runs apart", () => {
    const runs = logRuns(
      buildLog([
        line({ id: 1, kind: "start", run: "gate:1", text: "room-a\nmodel-a" }),
        line({ id: 2, kind: "start", run: "gate:2" }),
        line({ id: 3, kind: "text", run: "gate:1" }),
        line({ id: 4, kind: "end", run: "gate:2" }),
        line({ id: 5, kind: "end", run: "gate:1" })
      ])
    );

    expect(runs.map((run) => run.run)).toEqual(["gate:1", "gate:2"]);
    expect(runs[0]?.rows.map((row) => row.key)).toEqual(["1", "3", "5"]);
    expect(runs[0]?.start?.id).toBe(1);
    expect(runs[0]?.end?.id).toBe(5);
    expect([runs[0]?.first, runs[0]?.last]).toEqual([101, 105]);
  });

  test("a run's state comes from its end line, and only the newest of a log read to its end runs", () => {
    const [ended, failed, open] = logRuns(
      buildLog([
        line({ id: 1, kind: "start", run: "a" }),
        line({ id: 2, kind: "end", run: "a" }),
        line({ id: 3, kind: "start", run: "b" }),
        line({ id: 4, kind: "end", run: "b", state: "failed" }),
        line({ id: 5, kind: "start", run: "c" })
      ])
    );

    expect(runStep(wording, ended!, { newest: false, atEnd: true, opened: false }).state).toBe("done");
    expect(runStep(wording, failed!, { newest: false, atEnd: true, opened: false }).state).toBe("failed");
    expect(runStep(wording, open!, { newest: true, atEnd: true, opened: false }).state).toBe("running");
    expect(runStep(wording, open!, { newest: true, atEnd: false, opened: false }).state).toBe("unended");
    expect(runStep(wording, open!, { newest: false, atEnd: true, opened: false }).state).toBe("unended");
  });

  test("a run is named by its start line's first line, or said to go on from above where the page cut its start", () => {
    const [started, cut] = logRuns(
      buildLog([
        line({ id: 1, kind: "start", run: "a", text: "\nroom-a · model-a\ndepth" }),
        line({ id: 2, kind: "text", run: "b" })
      ])
    );

    expect(runStep(wording, started!, { newest: false, atEnd: true, opened: false }).title).toBe("room-a · model-a");
    expect(runStep(wording, cut!, { newest: false, atEnd: true, opened: false }).title).toBe(wording("agents.label.run_continued"));
  });

  test("a run's time is the clock it began at and how long it went from its first line to its last", () => {
    const [long, short] = logRuns(
      buildLog([line({ id: 1, kind: "start", run: "a" }), line({ id: 2, kind: "start", run: "b" }), line({ id: 31, kind: "end", run: "a" })])
    );

    expect(runStep(wording, long!, { newest: false, atEnd: true, opened: false }).time).toBe(`09:01:41 · ${wording("common.label.seconds", { n: 30 })}`);
    expect(runStep(wording, short!, { newest: true, atEnd: true, opened: false }).time).toBe("09:01:42");
  });

  test("the newest run, a running run and the run a screen opened at stand open; the rest fold", () => {
    const [first, second] = logRuns(buildLog([line({ id: 1, kind: "end", run: "a" }), line({ id: 2, kind: "end", run: "b" })]));

    expect(runStep(wording, first!, { newest: false, atEnd: true, opened: false }).open).toBe(false);
    expect(runStep(wording, first!, { newest: false, atEnd: true, opened: true }).open).toBe(true);
    expect(runStep(wording, second!, { newest: true, atEnd: true, opened: false }).open).toBe(true);
  });

  test("the run a screen opened at is the run it named, or the first that began at the second and room it named", () => {
    const runs = logRuns(
      buildLog([line({ id: 1, kind: "start", run: "a" }), line({ id: 5, kind: "start", run: "b" }), line({ id: 6, kind: "start", run: "c" })])
    );

    expect(openedRun(runs, null)).toBeNull();
    expect(openedRun(runs, { run: "c" })).toBe("c");
    expect(openedRun(runs, { at: 103 })).toBe("b");
    expect(openedRun(runs, { at: 103, chat: 7 })).toBeNull();
  });
});

describe("how a line is shown", () => {
  // A call wears its tool's own name as its chip, a shell call `Bash` like any other, with no kind
  // word before it and no badge for the server it came from.
  test("a call wears its tool's own name and icon as its chip", () => {
    expect(toolChip({ kind: "tool", tool: { name: "Bash", icon: null } })).toEqual({ label: "Bash", icon: GENERIC_TOOL_ICON });
    expect(toolChip({ kind: "tool", tool: { name: "memory_add", icon: "material-symbols:cognition-2-outline-sharp" } })).toEqual({
      label: "memory_add",
      icon: "material-symbols:cognition-2-outline-sharp",
    });
    expect(toolChip(line({ id: 1, kind: "tool", name: "mcp__web__web_search" }))).toEqual({ label: "web_search", icon: GENERIC_TOOL_ICON });
  });

  test("every kind wears its own word", () => {
    expect(kindLook(wording, "thinking").label).toBe(KO.line_89);
    expect(kindLook(wording, "tool-result").label).toBe(wording("agents.label.line_tool_result"));
    expect(kindLook(wording, KO.line_91).label).toBe(KO.line_91_2);
  });

  test("what a run or the bot wrote is words, and what records the run — its prompt included — is not", () => {
    for (const kind of ["thinking", "text", "note", "end"]) {
      expect(kindLook(wording, kind).words).toBe(true);
    }

    for (const kind of ["start", "prompt", "tool", "tool-result", KO.line_99]) {
      expect(kindLook(wording, kind).words).toBe(false);
    }
  });

  test("the prompt a session was launched with wears its own word, and a turn's prompt does not", () => {
    expect(lineLook(wording, { kind: "prompt", name: "system" })).toMatchObject({ label: KO.line_105, words: false });
    expect(lineLook(wording, { kind: "prompt", name: null }).label).toBe(KO.line_106);
    expect(lineLook(wording, { kind: "text", name: "system" }).label).toBe(wording("agents.label.line_text"));
  });

  test("what the owner said to a worker reads as their words, whole, and not as a prompt a run was handed", () => {
    expect(lineLook(wording, { kind: "prompt", name: "word" })).toMatchObject({ label: wording("agents.label.line_word"), words: true });
  });

  test("each sort of thing a turn was handed wears the owner's own word for it", () => {
    const sorts: [string, string][] = [
      ["room", KO.line_116],
      ["memory", KO.line_117],
      ["person", KO.line_118],
      ["document", KO.line_119],
      ["rule", KO.line_120],
      ["situation", KO.line_121],
      ["knowledge", KO.line_122],
      ["archive", KO.line_123]
    ];

    for (const [name, label] of sorts) {
      expect(lineLook(wording, { kind: "context", name })).toEqual({ label, color: "success", words: false });
    }

    // They are one family and read as one: the word is what tells them apart, not the tone.
    expect(new Set(sorts.map(([name]) => lineLook(wording, { kind: "context", name }).color))).toEqual(new Set(["success"]));
  });

  test("what a turn was handed is a record, and a sort the screen does not know still says it was handed", () => {
    expect(lineLook(wording, { kind: "context", name: "archive" }).words).toBe(false);
    expect(lineLook(wording, { kind: "context", name: KO.line_136 }).label).toBe(KO.line_136_2);
    expect(lineLook(wording, { kind: "context", name: null }).label).toBe(KO.line_137);
    // And it is not the tone of a tool call or of the chat agent's own words, so the buckets stand apart.
    expect(lineLook(wording, { kind: "context", name: "person" }).color).not.toBe(kindLook(wording, "tool").color);
    expect(lineLook(wording, { kind: "context", name: "person" }).color).not.toBe(kindLook(wording, "text").color);
  });

  test("a result and every other line keep their kind's word", () => {
    expect(toolChip({ kind: "tool-result", tool: { name: "Bash", icon: null } })).toBeNull();
    expect(toolChip({ kind: "prompt", tool: null })).toBeNull();
    expect(toolChip({ kind: "tool", tool: null })).toBeNull();
  });
});

describe("what a tool call shows on its own row", () => {
  const input = (fields: Record<string, unknown>): string => JSON.stringify(fields);

  test("a Bash call shows the command and the description it came with", () => {
    const call = toolCall(
      "Bash",
      input({
        command: 'cat client/app/domain/settings.ts; echo "----STATUS DEPTH----"; grep -n "depthLabel" -A8 client/app/domain/status.ts | head -30',
        description: "Read settings domain"
      })
    );

    expect(call.head).toBe(
      'cat client/app/domain/settings.ts; echo "----STATUS DEPTH----"; grep -n "depthLabel" -A8 client/app/domain/status.ts | head -30'
    );
    expect(call.description).toBe("Read settings domain");
  });

  test("a very long command stands on the row whole, with no ellipsis of ours", () => {
    const command = `for file in ${"a/very/long/path/to/one/more/file.ts ".repeat(40)}; do bunx tsc --noEmit "$file"; done`;
    const call = toolCall("Bash", input({ command }));

    expect(call.head).toBe(command.replace(/\s+/g, " ").trim());
    expect(call.head.length).toBeGreaterThan(1000);
    expect(call.head).not.toContain("…");
  });

  test("a command written over several lines reads as one flowing line", () => {
    expect(toolCall("Bash", input({ command: "cd /repo\n  bun test\n" })).head).toBe("cd /repo bun test");
  });

  test("each tool shows the argument that tells what it did", () => {
    expect(toolCall("Read", input({ file_path: "/repo/src/todo.ts" })).head).toBe("/repo/src/todo.ts");
    expect(toolCall("Grep", input({ pattern: "depthLabel", path: "client/app", output_mode: "content" })).head).toBe(
      "depthLabel · client/app"
    );
    expect(toolCall("Glob", input({ pattern: "**/*.vue" })).head).toBe("**/*.vue");
    expect(toolCall("Edit", input({ file_path: "/repo/web/app.vue", old_string: "a", new_string: "b" })).head).toBe(
      "/repo/web/app.vue"
    );
    expect(toolCall("WebSearch", input({ query: "Deno 2.9 release" })).head).toBe("Deno 2.9 release");
    expect(toolCall("Skill", input({ skill: "workflow-authoring" })).head).toBe("workflow-authoring");
  });

  test("a co-worker launch shows what it was told to do, and its own description beside it", () => {
    const call = toolCall("Agent", input({ description: "PostgreSQL version", prompt: "Find the latest stable release" }));

    expect(call.head).toBe("Find the latest stable release");
    expect(call.description).toBe("PostgreSQL version");
  });

  test("an MCP call lays out its own arguments, since no rule is written for it", () => {
    expect(toolCall("mcp__web__web_fetch", input({ url: "https://example.dev/a", max_chars: 1200 })).head).toBe(
      "url=https://example.dev/a · max_chars=1200"
    );
    expect(toolCall("mcp__chrome-devtools__click", input({ pageId: 3, uid: "2_68" })).head).toBe("pageId=3 · uid=2_68");
  });

  test("a line the writer cut still says what it can", () => {
    const cut = '{"script":"export const meta = {\\n  name: \'review-changes\',';

    expect(toolCall("Workflow", cut).head).toBe("export const meta = { name: 'review-changes',");
  });

  test("an argument the tool already tells with is not repeated as its description", () => {
    const call = toolCall("ScheduleWakeup", JSON.stringify({ reason: KO.line_215, delaySeconds: 1200 }));

    expect(call.head).toBe(KO.line_217);
    expect(call.description).toBeNull();
  });

  test("a call with nothing readable in it leaves the row to the fold", () => {
    expect(toolCall("Bash", "{}")).toEqual({ head: "", description: null });
    expect(toolCall(null, "not json at all")).toEqual({ head: "", description: null });
  });
});

describe("what a call's fold reads out of it", () => {
  const input = (fields: Record<string, unknown>): string => JSON.stringify(fields);

  const value = (text: string, name: string): string =>
    toolArguments(text).args.find((argument) => argument.name === name)?.value ?? "";

  test("a command written over several lines stands exactly as it was sent", () => {
    const command = "cd /repo\n  bun test\n\tbunx tsc --noEmit";

    expect(value(input({ command, description: KO.line_236 }), "command")).toBe(
      "cd /repo\n  bun test\n\tbunx tsc --noEmit"
    );
  });

  test("a value with a newline in it, or a long one, takes a block of its own", () => {
    const { args } = toolArguments(input({ file_path: "/repo/web/app.vue", old_string: "a\nb" }));

    expect(args.map((argument) => [argument.name, argument.block])).toEqual([
      ["file_path", false],
      ["old_string", true]
    ]);
    expect(toolArguments(input({ query: "x".repeat(200) })).args[0]?.block).toBe(true);
  });

  test("a value that is no string reads as the shape it is, indented", () => {
    expect(value(input({ pages: { from: 1, to: 3 } }), "pages")).toBe('{\n  "from": 1,\n  "to": 3\n}');
    expect(value(input({ ws: ["a", "b"] }), "ws")).toBe('[\n  "a",\n  "b"\n]');
    expect(value(input({ max_chars: 1200, deep: true, none: null }), "max_chars")).toBe("1200");
  });

  test("a value past the line bound is clipped there and says so", () => {
    const command = Array.from({ length: 30 }, (_, at) => `echo ${at}`).join("\n");
    const argument = toolArguments(input({ command })).args[0];

    expect(argument?.value.split("\n")).toHaveLength(20);
    expect(argument?.value.endsWith("echo 19")).toBe(true);
    expect(argument?.cut).toBe(true);
  });

  test("a value past the character bound is clipped there and says so", () => {
    const argument = toolArguments(input({ prompt: KO.line_267.repeat(2000) })).args[0];

    expect(argument?.value).toHaveLength(1500);
    expect(argument?.cut).toBe(true);
  });

  test("a value under both bounds stands whole and is not marked", () => {
    const argument = toolArguments(input({ command: "bun test" })).args[0];

    expect(argument).toEqual({ name: "command", value: "bun test", block: false, cut: false });
  });

  test("a line the writer cut yields what it can, with its newlines kept, and says it is short", () => {
    const cut = KO.line_280;
    const { args, whole } = toolArguments(cut);

    expect(whole).toBe(false);
    expect(args.map((argument) => argument.name)).toEqual(["description", "script"]);
    expect(args[1]?.value).toBe("export const meta = {\n  name: 'review-changes',");
  });

  test("a backslash of the value's own is read as one, not as the mark of a line break", () => {
    // The cut line is where the escapes are read by hand, and a value carrying a backslash
    // before an n — a Windows path, a regexp, a shell escape — is the case that tells whether
    // they are read one pass or one mark at a time.
    // The stored line, as the archive holds it: a pattern of a backslash, an n, a tab and ab,
    // written out as JSON and cut before its closing quote.
    const cut = '{"pattern":"\\\\n\\tab';

    expect(toolArguments(cut).args[0]?.value).toBe("\\n\tab");
    // And the row's own line still levels the tab into a space, because levelling is the line's
    // own doing and not the reader's.
    expect(toolCall("Grep", cut).head).toBe("\\n ab");
  });

  test("a line that survived whole says so", () => {
    expect(toolArguments(input({ command: "bun test" })).whole).toBe(true);
  });

  test("a call sent with no arguments has nothing to draw", () => {
    expect(toolArguments("{}")).toEqual({ args: [], whole: true });
    expect(toolArguments("   ")).toEqual({ args: [], whole: true });
  });

  test("a stored text that is no object stands whole under no name", () => {
    expect(toolArguments(KO.line_312).args).toEqual([
      { name: "", value: KO.line_313, block: false, cut: false }
    ]);
    expect(toolArguments("[1, 2]").args[0]?.value).toBe("[\n  1,\n  2\n]");
    expect(toolArguments("not json at all")).toEqual({
      args: [{ name: "", value: "not json at all", block: false, cut: false }],
      whole: false
    });
  });
});

describe("what a result shows before it is opened", () => {
  test("its first line with something in it, and how long the whole is", () => {
    expect(resultPreview(KO.line_325)).toEqual({ head: KO.line_325_2, lines: 5 });
    expect(resultPreview(KO.line_326)).toEqual({ head: KO.line_326, lines: 1 });
    expect(resultPreview("")).toEqual({ head: "", lines: 1 });
  });

  test("a result that ends where its last line ends is counted as it reads", () => {
    // Command output and file reads end with a newline; that ending is not another line.
    expect(resultPreview("abc\n")).toEqual({ head: "abc", lines: 1 });
    expect(resultPreview(KO.line_333)).toEqual({ head: KO.line_333_2, lines: 2 });
  });
});
