import { beforeEach, describe, expect, test } from "bun:test";
import { catalogueEntry, catalogueRow } from "../../support/catalogue";

import { wording } from "../../../apps/web/shared/wording";

import { holdCatalogue } from "../../../apps/web/app/domain/agents";
import { GENERIC_TOOL_ICON } from "../../../apps/web/app/domain/log";
import { actionLook, brainActions, listeningLines, windowClockLines, outcomeLine, phaseLook, receivedLine, subjectOf, turnActions, turnName, useHeldRuns } from "../../../apps/web/app/domain/working";

import type { AgentLogLine, AgentSummary, LiveRun, RunProgress, TurnAction } from "../../../apps/web/shared/types";

import KO from "../../fixtures/app/domain/working.test.ko.json";

// Every screen reads an agent's name out of the catalogue the archive answered with, so a test
// about a name puts that list in hand the way the app does.
function catalogued(name: string, kind: string, label: string): AgentSummary {
  const icon = "i-material-symbols-radio-button-checked-outline";

  if (kind === "chat" || kind === "room") return { ...catalogueRow(name, kind, label), icon };

  return catalogueEntry(name, kind === "worker" ? "repository" : "role", label, { icon });
}

beforeEach(() =>
  holdCatalogue([
    catalogued("content-judge", "gate", KO.line_49),
    catalogued("search", "runner", KO.line_50),
    catalogued("browse", "runner", KO.line_51),
    catalogued("digest", "editor", KO.line_52),
    catalogued("people-digest", "editor", KO.line_53),
    catalogued("worker", "worker", KO.line_54)
  ])
);


function progress(over: Partial<RunProgress> = {}): RunProgress {
  return { phase: "thinking", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0, ...over };
}

describe("what the room says the answering agent is doing", () => {
  test("listening reads by its own keys, under the name the turn's line wears, with the window's time left turning", () => {
    expect(listeningLines(wording, "Bob", 161)).toEqual({
      enabled: wording("room.status.chat_enabled"),
      state: wording("room.status.agent_listening", { subject: subjectOf("Bob") }),
      left: { keypath: "room.status.listening_left", figures: { time: { value: 161, text: "2:41" } } }
    });
    expect(listeningLines(wording, "Bob", 161).state).toContain("Bob");
    expect(listeningLines(wording, "Bob", -2).left.figures.time).toEqual({ value: 0, text: "0:00" });
    expect(wording("room.status.listening_left", { time: "2:41" })).toContain("2:41");
  });

  // The top bar says the same window's time left while it is open: that the chat agent listens, and the time
  // left as a timer reads it, never below nought.
  test("the top bar's clock says who listens and how long is left", () => {
    expect(windowClockLines(wording, "Bob", 161)).toEqual({
      state: wording("room.status.agent_listening", { subject: subjectOf("Bob") }),
      left: { keypath: "room.status.window_left", figures: { time: { value: 161, text: "2:41" } } }
    });
    expect(windowClockLines(wording, "Bob", -5).left.figures.time).toEqual({ value: 0, text: "0:00" });
    expect(wording("room.status.window_left", { time: "2:41" })).toContain("2:41");
  });

  test("thinking, writing and working a tool read differently", () => {
    expect(phaseLook(wording, KO.line_100, progress({ phase: "thinking" }))).toEqual({ label: wording("room.status.agent_thinking", { subject: KO.line_100_2 }) });
    expect(phaseLook(wording, KO.line_101, progress({ phase: "writing" }))).toEqual({ label: wording("room.status.agent_writing", { subject: KO.line_101_2 }) });

    // The line names the tool whether or not the stack below it already stands that call.
    const called = progress({
      phase: "tool",
      tool: "Bash",
      actions: [{ kind: "tool", name: "Bash", text: '{"command":"ls"}', state: null }]
    });

    expect(phaseLook(wording, KO.line_110, called)).toEqual({ label: KO.line_110_2 });
  });

  test("the tool is named in the word a person calls it by, never in the program's own", () => {
    expect(phaseLook(wording, KO.line_114, progress({ phase: "tool", tool: "Read" }))).toEqual({ label: KO.line_114_2 });
    expect(phaseLook(wording, KO.line_115, progress({ phase: "tool", tool: "mcp__web__web_search" }))).toEqual({ label: KO.line_115_2 });
    // A tool the vocabulary does not carry stands under the name it came with rather than unnamed.
    expect(phaseLook(wording, KO.line_117, progress({ phase: "tool", tool: "Brandnew" }))).toEqual({ label: KO.line_117_2 });
  });

  // Another supervisor whose engine a Job holds waits for that Job, and the line says which item's it is
  // (the agency's docs/supervisors.md, 「The engine it shares」).
  test("a turn waiting for its engine names the item whose Job holds it", () => {
    expect(phaseLook(wording, KO.line_123, progress({ phase: "waiting", waitingFor: { jobId: 5, todoId: 1099 } })))
      .toEqual({ label: wording("room.status.agent_waiting_engine_item", { subject: KO.line_124, item: "1099" }) });
    expect(phaseLook(wording, KO.line_125, progress({ phase: "waiting", waitingFor: { jobId: 5, todoId: null } })))
      .toEqual({ label: wording("room.status.agent_waiting_engine", { subject: KO.line_126 }) });
  });

  test("a phase the stream gave no tool name to says the tool without naming it", () => {
    expect(phaseLook(wording, KO.line_130, progress({ phase: "tool", tool: null }))).toEqual({ label: KO.line_130_2 });
  });

  test("nothing of a call's arguments can reach the line, since only the name is read", () => {
    const secret = progress({
      phase: "tool",
      tool: "Bash",
      actions: [{ kind: "tool", name: "Bash", text: '{"command":"login --password hunter2"}', state: null }]
    });

    expect(phaseLook(wording, KO.line_140, secret).label).toBe(KO.line_140_2);
    expect(phaseLook(wording, KO.line_141, secret).label).not.toContain("hunter2");
  });

  test("a run that has said nothing yet is thinking, which is where every run begins", () => {
    expect(phaseLook(wording, KO.line_145, null)).toEqual({ label: wording("room.status.agent_thinking", { subject: KO.line_145_2 }) });
  });

  test("the line names whoever the row is the turn of, with the particle its name asks for", () => {
    expect(phaseLook(wording, KO.line_149, progress({ phase: "thinking" }))).toEqual({ label: wording("room.status.agent_thinking", { subject: KO.line_149_2 }) });
    expect(phaseLook(wording, KO.line_150, progress({ phase: "writing" }))).toEqual({ label: wording("room.status.agent_writing", { subject: KO.line_150_2 }) });
  });

  test("another supervisor's turn wears the label the agents table gives it, never the registration name the turn carries", () => {
    holdCatalogue([catalogued("agent-c", "chat", "Agent C")]);

    expect(turnName(wording, { id: 11, name: "agent-c" })).toBe("Agent C");
  });

  test("another supervisor the agents table has no label for is named by its registration, and the chat agent by the catalogue's label for it", () => {
    expect(turnName(wording, { id: 11, name: KO.line_154 })).toBe(KO.line_154);
    // The pack's word stands for the chat agent only while the catalogue holds no session serving every room.
    expect(turnName(wording, undefined)).toBe(KO.line_156);

    holdCatalogue([catalogued("agent-c", "room", KO.line_158), catalogued("agent-b", "chat", KO.line_158_2)]);

    expect(turnName(wording, undefined)).toBe(KO.line_160);
  });

  test("a turn that left no answer names the agent whose turn it was", () => {
    expect(outcomeLine(wording, { key: "room.status.outcome_run_failed", speaker: { id: 11, name: KO.line_164 } })).toBe(wording("room.status.outcome_run_failed", { name: KO.line_164 }));
    expect(outcomeLine(wording, { key: "room.status.outcome_waited" })).toBe(wording("room.status.outcome_waited", { subject: KO.line_165 }));
  });
});

describe("what the room says the turn was handed", () => {
  test("the room's own messages, the bot's own quiet instructions, or both together", () => {
    const said = (messages: number, instructions: number): string => {
      const line = receivedLine({ messages, instructions });

      return line === null ? "" : wording(line.keypath, line.figures);
    };

    expect(said(3, 0)).toBe(wording("room.status.received_messages", { messages: "3" }));
    expect(said(0, 1)).toBe(wording("room.status.received_instructions", { instructions: "1" }));
    expect(said(2, 1)).toBe(KO.line_179);
  });

  test("a turn that took neither says nothing at all, rather than a row of noughts", () => {
    expect(receivedLine({ messages: 0, instructions: 0 })).toBeNull();
  });

  test("a turn the bot has said nothing about is not worked out from anything else", () => {
    expect(receivedLine(null)).toBeNull();
  });
});

describe("what one action of a running turn reads as", () => {
  const action = (over: Partial<TurnAction> = {}): TurnAction => ({ kind: "tool", name: "Bash", text: "{}", state: null, ...over });

  test("something the turn was handed wears its own sort and names the piece", () => {
    expect(actionLook(wording, action({ kind: "context", name: "person", text: "people/42/sheet.md", state: null }))).toEqual({
      look: { label: KO.line_349, color: "success", words: false },
      chip: null,
      text: "people/42/sheet.md",
      failed: false,
      mark: null
    });
  });

  test("a reference document says whether it was read on this turn or was already in the session", () => {
    expect(actionLook(wording, action({ kind: "context", name: "knowledge", text: "knowledge/a.md", state: "attached" })).mark).toEqual({
      icon: "i-material-symbols-fiber-new-outline",
      color: "primary",
      label: KO.line_361
    });
    expect(actionLook(wording, action({ kind: "context", name: "person", text: "people/42/sheet.md", state: "held" })).mark?.label).toBe(wording("agents.label.context_held"));
    expect(actionLook(wording, action({ kind: "tool", state: "succeeded" })).mark).toBeNull();
  });

  // A call wears its tool's own name as its chip, the way the agent's page shows it: `Bash` for a
  // shell call, an MCP tool's own name without its server, and the icon the tool declares.
  test("a call wears its tool's own name as its chip and says what the call was about", () => {
    expect(actionLook(wording, action({ name: "Read", text: '{"file_path":"/repo/src/todo.ts"}' }))).toMatchObject({
      chip: { label: "Read", icon: GENERIC_TOOL_ICON },
      text: "/repo/src/todo.ts"
    });
    expect(actionLook(wording, action({ name: "Bash", text: '{"command":"bun test"}' }))).toMatchObject({ chip: { label: "Bash" }, text: "bun test" });
    expect(actionLook(wording, action({ name: "mcp__web__web_search", text: KO.line_375 }))).toMatchObject({
      chip: { label: "web_search", icon: GENERIC_TOOL_ICON },
      text: KO.line_377
    });
    // A call read off the live picture wears the icon its tool declares; one read off the log, the tool its line says.
    const icons = new Map([["memory_add", "material-symbols:cognition-2-outline-sharp"]]);

    expect(actionLook(wording, action({ name: "mcp__bmo__memory_add", text: KO.line_382 }), icons).chip).toEqual({
      label: "memory_add",
      icon: "material-symbols:cognition-2-outline-sharp"
    });
    expect(actionLook(wording, action({ name: "mcp__other__memory_add", text: "{}" }), icons).chip?.icon).toBe(GENERIC_TOOL_ICON);
    expect(
      actionLook(wording, action({ name: "mcp__bmo__memory_list", tool: { name: "memory_list", icon: "material-symbols:cognition-2-outline-sharp" } })).chip
    ).toEqual({ label: "memory_list", icon: "material-symbols:cognition-2-outline-sharp" });
    expect(actionLook(wording, action({ name: null, text: "{}" })).chip).toBeNull();
  });

  test("a call that came back a failure is marked, and one still out is not", () => {
    expect(actionLook(wording, action({ state: "failed" })).failed).toBe(true);
    expect(actionLook(wording, action({ state: "succeeded" })).failed).toBe(false);
    expect(actionLook(wording, action({ state: null })).failed).toBe(false);
  });

  test("a masked value reaches the block masked, since the block shows what was recorded", () => {
    const masked = actionLook(wording, action({ text: KO.line_400 }));

    expect(masked.text).toBe(KO.line_402);
  });

  test("arguments the screen can make nothing of still stand as they were sent", () => {
    expect(actionLook(wording, action({ name: "Bash", text: "{}" })).text).toBe("{}");
  });
});

describe("what a finished turn did, read back out of its run", () => {
  const line = (over: Partial<AgentLogLine> & Pick<AgentLogLine, "kind">): AgentLogLine => ({
    id: 1,
    agent: "agent-b",
    run: "chat:-1003:1789751065738:1",
    chatId: -1003,
    at: 100,
    name: null,
    tool: null,
    parent: null,
    ref: null,
    state: null,
    truncated: false,
    text: "",
    patches: [],
    patchesMore: 0,
    ...over
  });

  test("is what it was handed and what it called, in the order the run wrote them", () => {
    const actions = turnActions([
      line({ kind: "start", text: "claude-opus-5" }),
      line({ kind: "prompt", text: KO.line_432 }),
      line({ kind: "context", name: "room", text: "chat -1003" }),
      line({ kind: "context", name: "person", text: "people/42/sheet.md", state: "held" }),
      line({ kind: "context", name: "knowledge", text: "knowledge/a.md", state: "attached" }),
      line({ kind: "thinking", text: KO.line_436 }),
      line({ kind: "tool", name: "Read", ref: "t1", text: '{"file_path":"/repo/a.ts"}' }),
      line({ kind: "tool-result", ref: "t1", state: "succeeded", text: KO.line_438 }),
      line({ kind: "text", text: KO.line_439 }),
      line({ kind: "end", text: "done" })
    ]);

    expect(actions).toEqual([
      { kind: "context", name: "room", tool: null, text: "chat -1003", state: null },
      { kind: "context", name: "person", tool: null, text: "people/42/sheet.md", state: "held" },
      { kind: "context", name: "knowledge", tool: null, text: "knowledge/a.md", state: "attached" },
      { kind: "tool", name: "Read", tool: null, text: '{"file_path":"/repo/a.ts"}', state: "succeeded" }
    ]);
  });

  test("a result is how its call ended, and never a line of its own", () => {
    const failed = turnActions([
      line({ kind: "tool", name: "Bash", ref: "t2", text: '{"command":"ls"}' }),
      line({ kind: "tool-result", ref: "t2", state: "failed", text: KO.line_454 }),
      // A result whose call is not on this page belongs to nothing here.
      line({ kind: "tool-result", ref: "gone", state: "succeeded", text: KO.line_456 })
    ]);

    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ name: "Bash", state: "failed" });
  });

  test("a call still without its result stands as one still out", () => {
    expect(turnActions([line({ kind: "tool", name: "Bash", ref: "t3", text: "{}" })])[0]?.state).toBeNull();
  });
});

describe("what a turn read from the brain", () => {
  test("is the documents it was handed and its calls to the brain's reading tools, by any road's name", () => {
    const actions: TurnAction[] = [
      { kind: "context", name: "doc-a", text: "doc-a", state: "attached" },
      { kind: "tool", name: "mcp__bmo__brain_recall", tool: { name: "brain_recall", icon: null }, text: "{}", state: "succeeded" },
      { kind: "tool", name: "bmo/brain_list", tool: null, text: "{}", state: null },
      { kind: "tool", name: "bash", tool: { name: "bash", icon: null }, text: "{}", state: "succeeded" },
      { kind: "tool", name: "shell", tool: { name: "shell", icon: null }, text: JSON.stringify({ command: "bmo use bmo/brain_similar --json '{}'" }), state: "succeeded" }
    ];

    expect(brainActions(actions).map((action) => action.name)).toEqual(["doc-a", "mcp__bmo__brain_recall", "bmo/brain_list", "shell"]);
  });
});

describe("the runs a room's line stands on", () => {
  const run = (id: number): LiveRun => ({ id, kind: "worker", agent: "worker-a", chatId: -7, messageId: null, startedAt: 1, unit: `job-${id}`, capSeconds: null, depth: null, model: null, startedBy: null, todoId: id, progress: null });

  test("a picture with no runs at all says nothing about jobs, and leaves the line as it stood", () => {
    const held = useHeldRuns(10);

    held.take([run(1), run(2), run(3)]);
    held.take(undefined);

    expect(held.runs.value.map((one) => one.id)).toEqual([1, 2, 3]);
    held.stop();
  });

  test("an empty picture clears the line only once the settle window passes with nothing running again", async () => {
    const held = useHeldRuns(20);

    held.take([run(1), run(2), run(3)]);
    held.take([]);
    expect(held.runs.value).toHaveLength(3);

    // Work running again inside the window keeps the line, and the window closes with nothing cleared.
    await Bun.sleep(8);
    held.take([run(4)]);
    await Bun.sleep(25);

    expect(held.runs.value.map((one) => one.id)).toEqual([4]);

    held.take([]);
    await Bun.sleep(35);

    expect(held.runs.value).toEqual([]);
    held.stop();
  });
});
