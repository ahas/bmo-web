import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { liveChip, requestsText, roundChip, runEnds, spendChip, spendText, turnLines } from "../../../apps/web/app/domain/turns";

import type { AgentLogLine, RunProgress, SpendFigure, TurnRoad } from "../../../apps/web/shared/types";
import type { LogRow } from "../../../apps/web/app/domain/log";
import KO from "../../fixtures/app/domain/turns.test.ko.json";

function row(key: string, run: string, kind = "text", depth = 0): LogRow {
  const line = { id: Number(key), agent: "agent-a", run, chatId: -1, at: 1, kind, name: null, tool: null, parent: null, ref: null, state: null, truncated: false, text: "", patches: [], patchesMore: 0 } as AgentLogLine;

  return { key, line, results: [], depth };
}

describe("where a run's chip stands", () => {
  test("under the line each run ended on, whatever the run is, and under no line of a run still going", () => {
    const ends = runEnds([
      row("1", "chat:-1003:100"),
      row("2", "chat:-1003:100", "end"),
      row("3", "gate:4:100", "end"),
      row("4", "bmo-task-7", "end", 1),
      row("5", "bmo-task-7", "end"),
      row("6", "bmo-search-8"),
    ]);

    expect([...ends]).toEqual([
      ["2", "chat:-1003:100"],
      ["3", "gate:4:100"],
      ["5", "bmo-task-7"],
    ]);
  });
});

describe("what a chip reads", () => {
  const figure = (over: Partial<SpendFigure> = {}): SpendFigure => ({
    inputTokens: 157_000,
    outputTokens: 49_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 155_000,
    measured: 2,
    unmeasured: 0,
    ...over,
  });

  test("one figure, the tokens the round wrote, and nothing of what it read or cached", () => {
    expect(spendText(figure())).toBe("49K");
    expect(spendText(figure({ unmeasured: 1 }))).toBe("49K");
  });

  test("a round nobody measured reads a dash rather than a nought", () => {
    expect(spendText(figure({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, measured: 0, unmeasured: 3 }))).toBe("—");
  });

  test("a round spreads into its runs, and a run with none of its own into its own reading", () => {
    const road: TurnRoad = { id: 7, stage: "chat", provider: "claude-code", model: "m", outcome: "answered", ms: 1_000, tokens: null };

    expect(roundChip(wording, { ...figure(), roads: [road], context: null }).lines.map((line) => line.key)).toEqual([7]);

    const own = spendChip(wording, figure(), []);

    expect(own.lines).toHaveLength(1);
    expect(own.lines[0]).toMatchObject({ stage: wording("agents.label.this_run"), outcome: null });
    expect(own.lines[0]?.tally).toMatchObject({ inputTokens: 157_000, outputTokens: 49_000, cacheReadTokens: 0, cacheWriteTokens: 155_000, tokens: 361_000 });
    expect(spendChip(wording, figure({ measured: 0, unmeasured: 1 }), []).lines[0]).toMatchObject({ outcome: KO.line_65, tally: { inputTokens: null, tokens: 0 } });
  });
});

describe("what a turn still running reads", () => {
  const progress = (over: Partial<RunProgress> = {}): RunProgress => ({
    phase: "writing",
    tool: null,
    thinkingTokens: null,
    contextTokens: null,
    cacheReadTokens: null,
    requestId: null,
    spent: null,
    writtenTokens: null,
    actions: [],
    droppedActions: 0,
    droppedContext: 0,
    ...over,
  });

  test("what it has written so far, marked as an estimate, with the requests' own read and cache in the spread", () => {
    const chip = liveChip(wording, progress({ spent: { inputTokens: 12, cacheReadTokens: 96_000, cacheWriteTokens: 1_500 }, thinkingTokens: 1_200, writtenTokens: 300 }));

    expect(chip.text).toBe("~1.5K");
    expect(chip.estimated).toBe(true);
    expect(chip.lines[0]?.tally).toMatchObject({ inputTokens: 12, outputTokens: 1_500, cacheReadTokens: 96_000, cacheWriteTokens: 1_500 });
  });

  test("nothing counted yet stands as a dash rather than a nought", () => {
    expect(liveChip(wording, progress()).text).toBe("—");
    expect(liveChip(wording, null).text).toBe("—");
  });
});

describe("what a turn's line says", () => {
  const road = (fields: Partial<TurnRoad>): TurnRoad => ({
    id: 1,
    stage: "chat",
    provider: "claude-code",
    model: "claude-opus-5",
    outcome: "answered",
    ms: 12_345,
    tokens: { inputTokens: 1_200, outputTokens: 30, cacheReadTokens: 250_000, cacheWriteTokens: 0 },
    ...fields,
  });

  test("the stage by its name, the road it took, how long and the four kinds it spent", () => {
    const [line] = turnLines(wording, [road({})]);

    expect(line).toMatchObject({ stage: wording("room.label.stage_chat"), road: "CC::O5", outcome: null, took: "12,345ms" });
    expect(line?.tally).toEqual({ inputTokens: 1_200, outputTokens: 30, cacheReadTokens: 250_000, cacheWriteTokens: 0, tokens: 251_230 });
  });

  test("a road that did not answer says how it ended, and one never measured knows none of the four", () => {
    const [line] = turnLines(wording, [road({ stage: "output-verify", outcome: "timeout", tokens: null })]);
    const unmeasured = turnLines(wording, [road({ tokens: undefined })])[0]?.tally;

    expect(line?.outcome).toBe(KO.line_122);
    expect(line?.tally).toEqual({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, tokens: 0 });
    expect(unmeasured).toEqual(line?.tally);
  });
});

describe("why a run's cache read stands as it does", () => {
  test("says how many requests carried its context in, the context and the cache read", () => {
    expect(requestsText(wording, 3_087_360, 630_000)).toBe(
      [wording("agents.label.run_requests", { n: "5" }), wording("agents.label.run_context", { tokens: "630K" }), wording("agents.label.run_cache_read", { n: "3,087,360" })].join(" · ")
    );
    expect(requestsText(wording, 3_087_360, null)).toBeNull();
    expect(requestsText(wording, 0, 630_000)).toBeNull();

    const figure = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 3_087_360, cacheWriteTokens: 0, measured: 1, unmeasured: 0, contextTokens: 630_000 };

    expect(spendChip(wording, figure, []).lines[0]?.requests).toBe(requestsText(wording, 3_087_360, 630_000));
  });
});
