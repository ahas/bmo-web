import { beforeEach, describe, expect, test } from "bun:test";
import { conversationOf } from "../../support/conversation";

import { wording } from "../../../apps/web/shared/wording";

// The owner's own room as the room list names it.
const OWNER_ROOM_TITLE = "Owner room";
import { holdCatalogue } from "../../../apps/web/app/domain/agents";
import { GENERIC_TOOL_ICON } from "../../../apps/web/app/domain/log";
import { actionLook, listeningLines, windowClockLines, outcomeLine, phaseLook, receivedLine, roomRuns, runSummary, subjectOf, turnActions, turnName } from "../../../apps/web/app/domain/working";

import type { AgentLogLine, AgentSummary, LiveRun, RoomSummary, RunProgress, TurnAction, WatchView } from "../../../apps/web/shared/types";
import type { RoomRunLine } from "../../../apps/web/app/domain/working";
import KO from "../../fixtures/app/domain/working.test.ko.json";

// Every screen reads an agent's name out of the catalogue the archive answered with, so a test
// about a name puts that list in hand the way the app does.
function catalogued(name: string, kind: string, label: string): AgentSummary {
  const carried = conversationOf({ kind });

  return {
    name,
    kind,
    sessionScope: carried?.scope ?? null,
    turnShape: carried?.shape ?? null,
    defaultAnswerer: carried?.defaultAnswerer ?? false,
    model: null,
    lastMode: null,
    lastModel: null,
    lastEffort: null,
    label,
    aliases: null,
    icon: "i-material-symbols-radio-button-checked-outline",
    cwd: null,
    builtin: true,
    chatId: null,
    runs: 0,
    lastRunAt: null,
    lastKeepaliveAt: null,
    contextTokens: null,
    keepaliveStopped: false,
    keepalivePausedAt: null
  };
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


const rooms: RoomSummary[] = [
  { chatId: -1003, title: "Alpha Room", messageCount: 12, lastMessageAt: null, pinned: false },
  { chatId: 10000001, title: OWNER_ROOM_TITLE, messageCount: 3, lastMessageAt: null, pinned: false }
];

function progress(over: Partial<RunProgress> = {}): RunProgress {
  return { phase: "thinking", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0, ...over };
}

function run(over: Partial<LiveRun> = {}): LiveRun {
  return {
    id: 7,
    kind: "runner",
    agent: "search",
    chatId: -1003,
    messageId: null,
    unit: "bmo-run-1",
    startedAt: 1_788_000_000,
    capSeconds: 180,
    depth: "thorough",
    model: null,
    startedBy: null,
    todoId: null,
    progress: null,
    ...over
  };
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

  // A companion whose engine a Job holds waits for that Job, and the line says which item's it is
  // (docs/companions.md, 「The engine it shares」).
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

  test("a companion's turn is named as the bot named it, and the chat agent's by the catalogue's label for it", () => {
    expect(turnName(wording, { id: 11, name: KO.line_154 })).toBe(KO.line_154);
    // The pack's word stands for the chat agent only while the catalogue holds no session serving every room.
    expect(turnName(wording, undefined)).toBe(KO.line_156);

    holdCatalogue([catalogued("chat:-1003", "chat", KO.line_158), catalogued("agent-b", "chat", KO.line_158_2)]);

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

describe("what else is running for a room", () => {
  test("only what belongs to that room, and never a gate — the steps already tell those", () => {
    const live = [run(), run({ id: 8, chatId: -1002 }), run({ id: 9, kind: "gate", agent: "content-judge" })];

    expect(roomRuns(wording, live, -1003, rooms).map((line) => line.key)).toEqual(["runner:7"]);
  });

  test("each run falls in the one count the room's line keeps for its sort", () => {
    const live = [run(), run({ id: 8, kind: "worker", agent: "worker", depth: null, todoId: 26 }), run({ id: 9, depth: null, unit: "bmo-watch-1" }), run({ id: 10, kind: "editor", agent: "digest", depth: null, unit: null })];
    const watch = { id: 3, unit: "bmo-watch-1", name: KO.line_200, note: "" } as WatchView;

    expect(roomRuns(wording, live, -1003, rooms, [watch]).map((line) => line.sort)).toEqual(["search", "job", "watch", "other"]);
  });

  test("a run wears what it is: a search its rung, a job the item it is a run of", () => {
    expect(roomRuns(wording, [run()], -1003, rooms)[0]?.label).toBe(KO.line_206);
    expect(
      roomRuns(
        wording,
        [run({ kind: "worker", agent: "worker", depth: null, model: "claude-opus-5", todoId: 26, progress: null })],
        -1003,
        rooms
      )[0]?.label
    ).toBe(KO.line_214);
  });

  test("a work order's own run says where in the order it stands, never its unit name", () => {
    const line = roomRuns(
      wording,
      [run({ kind: "worker", agent: "work-order-257-stage-0-0-1", depth: null, todoId: 257, progress: KO.line_220 })],
      -1003,
      rooms
    )[0];

    // How far the order has come, never which run of the item this is.
    expect(line?.label).toBe(KO.line_226);
    // The identifier itself is what the log is kept under, so shortening the name must not
    // touch where the line leads.
    expect(line?.agent).toBe("work-order-257-stage-0-0-1");
    expect(line?.to).toBe("/agents/work-order-257-stage-0-0-1");
  });

  test("a job with no item behind it wears its model, since there is no number to give", () => {
    expect(
      roomRuns(wording, [run({ kind: "worker", agent: "worker", depth: null, model: "claude-opus-5" })], -1003, rooms)[0]?.label
    ).toBe(KO.line_236);
  });

  test("a watch's check is named after the watch it is a check of, and carries the watch itself", () => {
    const watch: WatchView = {
      id: 12,
      kind: "condition",
      chatId: -1003,
      name: KO.line_244,
      note: KO.line_245,
      condition: "test -f /srv/build/done",
      dueAt: null,
      deadlineAt: 1_788_003_600,
      intervalSeconds: 600,
      lastCheckedAt: 1_788_000_300,
      lastExit: 1,
      unit: "bmo-run-1",
      memoryId: 308
    };
    const line = roomRuns(wording, [run({ agent: "watch" })], -1003, rooms, [watch])[0];

    // The number and the short name, rather than the name of whatever agent does the looking, and
    // never the whole of what it promised.
    expect(line?.label).toBe(KO.line_259);
    expect(line?.watch).toBe(watch);
  });

  test("a run no standing watch names is left as the run it is, and carries no watch", () => {
    const other: WatchView = {
      id: 12, kind: "timer", chatId: -1003, name: null, note: KO.line_265, condition: null, dueAt: 1_788_003_600,
      deadlineAt: 1_788_003_600, intervalSeconds: null, lastCheckedAt: null, lastExit: null, unit: "bmo-run-9",
      memoryId: null
    };

    expect(roomRuns(wording, [run()], -1003, rooms, [other])[0]?.label).toBe(KO.line_270);
    expect(roomRuns(wording, [run()], -1003, rooms, [other])[0]?.watch).toBeNull();
    expect(roomRuns(wording, [run({ unit: null })], -1003, rooms, [other])[0]?.watch).toBeNull();
  });

  test("a room's own the chat agent launched it, and the room is told so", () => {
    expect(roomRuns(wording, [run({ startedBy: "chat:-1003" })], -1003, rooms)[0]?.launcher).toBe(wording("live.label.launcher_room", { title: "Alpha Room" }));
  });

  test("a run nobody wrote a launcher on claims none, rather than guessing at the room", () => {
    expect(roomRuns(wording, [run()], -1003, rooms)[0]?.launcher).toBeNull();
  });

  test("the owner's console says so instead of naming a room", () => {
    expect(roomRuns(wording, [run({ startedBy: "console" })], -1003, rooms)[0]?.launcher).toBe(wording("live.label.launcher_console"));
  });

  test("a line names the agent at work and where its log is read", () => {
    const line = roomRuns(wording, [run({ agent: "search" })], -1003, rooms)[0];

    // Pressing the line opens this agent's log over the room, and the button inside it goes to
    // the same place the sidebar would have gone.
    expect(line?.agent).toBe("search");
    expect(line?.to).toBe("/agents/search");
  });

  test("each worker's job stands under that worker's own name, with its own log behind it", () => {
    holdCatalogue([catalogued("worker", "worker", KO.line_297), catalogued("infra", "worker", KO.line_297_2)]);

    const lines = roomRuns(
      wording,
      [
        run({ id: 11, kind: "worker", agent: "worker", depth: null, todoId: 26, progress: null }),
        run({ id: 12, kind: "worker", agent: "infra", depth: null, todoId: 27, progress: null })
      ],
      -1003,
      rooms
    );

    expect(lines.map((line) => line.label)).toEqual([KO.line_309, KO.line_309_2]);
    // The name and the log go together: a line under the right name that opens the wrong log
    // is the same mistake read a second later.
    expect(lines.map((line) => line.to)).toEqual(["/agents/worker", "/agents/infra"]);
  });

  test("a chat agent's own name survives being put in a path", () => {
    const line = roomRuns(wording, [run({ kind: "worker", agent: "chat:-1003" })], -1003, rooms)[0];

    expect(line?.agent).toBe("chat:-1003");
    expect(line?.to).toBe("/agents/chat%3A-1003");
  });

  test("another room's the chat agent is named where its work lands", () => {
    const sent = roomRuns(wording, [run({ startedBy: "chat:10000001" })], -1003, rooms)[0];

    expect(sent?.launcher).toBe(wording("live.label.launcher_room", { title: OWNER_ROOM_TITLE }));
  });
});

describe("the room's one line of counts", () => {
  const line = (sort: RoomRunLine["sort"], at: number) => ({ key: `${sort}:${at}`, sort }) as RoomRunLine;

  test("counts each sort that runs, and a deployment is none of them", () => {
    const lines = [...[1, 2, 3, 4, 5, 6, 7].map((at) => line("job", at)), line("watch", 1), line("watch", 2), line("watch", 3)];

    expect(runSummary(wording, lines)).toBe(KO.line_335);
    expect(runSummary(wording, [line("search", 1), line("other", 2)])).toBe(KO.line_336);
  });

  test("says nothing where nothing runs", () => {
    expect(runSummary(wording, [])).toBe("");
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
