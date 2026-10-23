import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { kindFigures } from "../../../apps/web/app/domain/usage";
import { agentVitals, agentWork, turnWord } from "../../../apps/web/app/domain/vitals";

import type { AgentTokenUsage, LiveRun, LiveRunKind, RunProgress } from "../../../apps/web/shared/types";
import type { VitalsInput } from "../../../apps/web/app/domain/vitals";
import KO from "../../fixtures/app/domain/vitals.test.ko.json";

function run(kind: LiveRunKind, agent: string, chatId: number | null, startedAt: number): LiveRun {
  return {
    id: 1,
    kind,
    agent,
    chatId,
    messageId: null,
    unit: "bmo-run-1",
    startedAt,
    capSeconds: null,
    depth: null,
    model: null,
    startedBy: null,
    todoId: null,
    progress: null
  };
}

function input(over: Partial<VitalsInput> = {}): VitalsInput {
  return {
    name: "worker",
    chatId: null,
    model: null,
    contextTokens: null,
    usage: null,
    live: [],
    compacting: [],
    turn: null,
    ...over
  };
}

// One agent's week as the archive answers it: the plain total, and the four kinds behind it. The
// vitals carry the whole row rather than one number off it, because each kind stands under its
// own name on the screen and none of them can be worked out from the total.
function week(over: Partial<AgentTokenUsage> = {}): AgentTokenUsage {
  return {
    agent: "worker",
    tokens: 75_106_713,
    runs: 12,
    inputTokens: 6_000,
    outputTokens: 94_000,
    cacheReadTokens: 74_000_000,
    cacheWriteTokens: 1_006_713,
    unsplitRuns: 0,
    unsplitTokens: 0,
    ...over
  };
}

function progress(over: Partial<RunProgress> = {}): RunProgress {
  return { phase: "thinking", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0, ...over };
}

// Which figures the machine actually writes down, agent by agent. A null here is the console
// saying nothing is recorded, which is not the same as a nought.
describe("what one agent has to show of itself", () => {
  test("a chat session has all four: it keeps a session, so it has a context", () => {
    const vitals = agentVitals(
      wording,
      input({
        name: "chat:-1001",
        chatId: -1001,
        model: "claude-opus-5",
        contextTokens: 99_931,
        usage: week({ agent: "chat:-1001" }),
        turn: { startedAt: 100, progress: progress() }
      })
    );

    expect(vitals).toEqual({
      mode: null,
      model: "claude-opus-5",
      contextTokens: 99_931,
      usage: week({ agent: "chat:-1001" }),
      work: { label: KO.line_87, since: 100 }
    });
    // The week's traffic is seventy-five million and seventy-four of them came back out of the
    // cache: the room's own prefix, read again on every turn it takes. The kinds are what say so,
    // and the row hands them on whole.
    expect(kindFigures(wording, vitals.usage as AgentTokenUsage).map((one) => `${one.label} ${one.text}`)).toEqual([
      KO.line_93,
      KO.line_94,
      KO.line_95,
      KO.line_96
    ]);
  });

  test("a gate keeps no session, so it has a model and a tally and no context at all", () => {
    const vitals = agentVitals(
      wording,
      input({
        name: "content-judge",
        model: "claude-sonnet-5",
        contextTokens: null,
        usage: week({ agent: "content-judge", tokens: 3_156_122 })
      })
    );

    expect(vitals.model).toBe("claude-sonnet-5");
    expect(vitals.usage?.tokens).toBe(3_156_122);
    // Nothing rather than a nought: a gate has no session to be carrying anything in.
    expect(vitals.contextTokens).toBeNull();
  });

  test("a runner says the size its last run ended at, which is not a session it is holding", () => {
    const vitals = agentVitals(wording, input({ name: "browse", model: "claude-opus-5", contextTokens: 31_512 }));

    expect(vitals.contextTokens).toBe(31_512);
  });

  test("a runner that has not answered inside the window has no tally, which is not a nought", () => {
    const vitals = agentVitals(wording, input({ name: "search", model: "claude-opus-5" }));

    expect(vitals.usage).toBeNull();
    expect(vitals.contextTokens).toBeNull();
  });

  test("an idle agent has no uptime, because nothing writes down when a session began", () => {
    expect(agentVitals(wording, input({ name: "worker", model: "claude-opus-5" })).work).toBeNull();
  });
});

describe("what an agent is doing at this second", () => {
  test("the worker is at the job while its run stands in the picture", () => {
    expect(agentWork(wording, input({ name: "worker", live: [run("worker", "worker", 10000001, 900)] }))).toEqual({
      label: KO.line_138,
      since: 900
    });
  });

  test("a runner is out searching, the browser searcher no less than the plain one", () => {
    expect(agentWork(wording, input({ name: "browse", live: [run("runner", "browse", -1001, 50)] }))?.label).toBe(wording("agents.status.run_runner"));
    expect(agentWork(wording, input({ name: "search", live: [run("runner", "search", -1001, 50)] }))?.label).toBe(wording("agents.status.run_runner"));
  });

  test("a gate is judging", () => {
    expect(
      agentWork(wording, input({ name: "content-judge", live: [run("gate", "content-judge", -1001, 10)] }))?.label
    ).toBe(KO.line_151);
  });

  test("a chat whose context is being folded says so, before anything else it might be doing", () => {
    expect(
      agentWork(
        wording,
        input({
          name: "chat:-1001",
          chatId: -1001,
          compacting: [{ chatId: -1001, since: 700 }],
          turn: { startedAt: 800, progress: progress({ phase: "writing" }) }
        })
      )
    ).toEqual({ label: wording("agents.status.compacting"), since: 700 });
  });

  test("a chat's own turn reads as the phase its stream says it is in", () => {
    expect(turnWord(wording, null)).toBe(wording("agents.status.turn_thinking"));
    expect(turnWord(wording, progress({ phase: "thinking" }))).toBe(wording("agents.status.turn_thinking"));
    expect(turnWord(wording, progress({ phase: "writing" }))).toBe(wording("agents.status.turn_writing"));
    expect(turnWord(wording, progress({ phase: "waiting", waitingFor: { jobId: 5, todoId: 1099 } }))).toBe(wording("agents.status.turn_waiting_engine"));
    expect(turnWord(wording, progress({ phase: "tool", tool: "Bash" }))).toBe(wording("agents.status.turn_tool_named", { tool: KO.line_173 }));
    expect(turnWord(wording, progress({ phase: "tool", tool: null }))).toBe(wording("agents.status.turn_tool"));
  });

  test("a run of another agent is not this agent's work", () => {
    expect(agentWork(wording, input({ name: "worker", live: [run("runner", "search", -1001, 50)] }))).toBeNull();
  });

  test("a fold of another room is not this room's", () => {
    expect(
      agentWork(wording, input({ name: "chat:-1001", chatId: -1001, compacting: [{ chatId: -2002, since: 700 }] }))
    ).toBeNull();
  });

  test("an agent with no run of its own going shows nothing, as any other agent does", () => {
    // A guessed state would be worse than none.
    expect(agentWork(wording, input({ name: "digest", live: [run("worker", "worker", 1, 5)] }))).toBeNull();
    expect(agentWork(wording, input({ name: "people-digest" }))).toBeNull();
  });

  test("an idle chat with nothing running and nothing folding says nothing", () => {
    expect(agentWork(wording, input({ name: "chat:-1001", chatId: -1001 }))).toBeNull();
  });
});
