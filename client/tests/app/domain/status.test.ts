import { beforeEach, describe, expect, test } from "bun:test";
import { catalogueEntry } from "../../support/catalogue";
import { WORKER } from "../../support/ids";

import { wording } from "../../../apps/web/shared/wording";

import { holdCatalogue } from "../../../apps/web/app/domain/agents";

import {
  modeLabel,
  modelLabel,
  outcomeLabel,
  stopTargetOf,
  uptimeClock,
} from "../../../apps/web/app/domain/status";

import type { AgentAxis, AgentSummary, GateRunRecord, JobRecord, LiveRun, RoomSummary, RunnerRecord } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/status.test.ko.json";

function gateRun(verdict: string): GateRunRecord {
  return { id: 1, agent: "content-judge", chatId: -1001, messageId: 7, verdict, ms: 1200, at: 100 };
}

const rooms: RoomSummary[] = [{ chatId: -1001, title: "Alpha Room", messageCount: 0, lastMessageAt: null, pinned: false }];

// The board's groups are the catalogue's own agents, so a test about them puts the catalogue in
// hand the way every screen does.
function catalogued(name: string, kind: AgentAxis, label: string): AgentSummary {
  return catalogueEntry(name, kind, label, { icon: "i-material-symbols-radio-button-checked-outline" });
}

beforeEach(() =>
  holdCatalogue([
    catalogued("search", "role", KO.line_76),
    catalogued("browse", "role", KO.line_77),
    catalogued("digest", "role", KO.line_78),
    catalogued("worker", "role", KO.line_79)
  ])
);

test("a registered model's answers have their own provider and model labels", () => {
  expect(modeLabel(wording, "registered")).toBe(wording("agents.title.registry"));
  expect(modelLabel("qwen3.8-27b")).toBe("Qwen3.8 27B");
});

// A Claude model is named by the rule the bot names it by rather than by a list of this screen's
// own, so a model the CLI began offering wears its name here with nothing added to this file.
test("a Claude model is read under the name its identifier gives, listed or not", () => {
  expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
  expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  expect(modelLabel("claude-opus-9")).toBe("Opus 9");
  expect(modelLabel("gpt-6-astra")).toBe("GPT-6 Astra");
});

describe("where a row of the board leads", () => {
  const runner: RunnerRecord = {
    id: 5,
    agent: "search",
    unit: "bmo-search-1788000000-7f3a",
    chatId: -1001,
    depth: "thorough",
    capSeconds: null,
    startedAt: 1_788_000_000,
    finishedAt: 1_788_000_120,
    outcome: "done"
  };

  const job: JobRecord = {
    id: 9,
    unit: "bmo-job-1788000500-91cd",
    chatId: -1001,
    model: "claude-opus-5",
    launchedAt: 1_788_000_500,
    finishedAt: 1_788_000_900,
    outcome: "done",
    ok: true,
    todoId: 26,
    attempt: 1,
    purpose: null,
    worker: WORKER
  };

  function live(kind: LiveRun["kind"], agent: string, id: number): LiveRun {
    return {
      id,
      kind,
      agent,
      chatId: -1001,
      messageId: null,
      unit: "bmo-run-1",
      startedAt: 1_788_000_000,
      capSeconds: null,
      depth: null,
      model: null,
      startedBy: null,
      todoId: null,
      progress: null
    };
  }

  // A job with no item is not numbered; it stands under the line its launcher wrote for why.
  // A job the owner stopped closed with ok false, but it did not fail: it reads as stopped.
  describe("what a finished run is called on the board", () => {
  });

  // A run still going is read for where the work stands: a step of a work order wears how far
  // that order has come, and anything else wears its item alone, never a count of runs.
  describe("what a run still going is called", () => {
  });
});

// Every row of the picture names what a stop on it would be aimed at, so this screen never works
// one out of the row's shape (the agency's docs/agent-control.md 「Stopping」).
describe("the stop a row names", () => {
  function row(over: Partial<LiveRun>): LiveRun {
    return {
      id: 1, kind: "runner", agent: "search", chatId: -1001, messageId: null, unit: null,
      startedAt: 1_788_000_000, capSeconds: null, depth: null, model: null, startedBy: null,
      todoId: null, progress: null, ...over
    };
  }

});

describe("uptime, as a clock reads it", () => {
  test("hours, minutes and seconds, each two digits", () => {
    expect(uptimeClock(0)).toBe("00:00:00");
    expect(uptimeClock(9)).toBe("00:00:09");
    expect(uptimeClock(59)).toBe("00:00:59");
    expect(uptimeClock(60)).toBe("00:01:00");
    expect(uptimeClock(3661)).toBe("01:01:01");
  });

  test("the hours run past a day rather than rolling over", () => {
    // What is asked is how long the run has been up, not what time it is.
    expect(uptimeClock(24 * 3600)).toBe("24:00:00");
    expect(uptimeClock(100 * 3600 + 61)).toBe("100:01:01");
  });

  test("a clock never runs backwards, however the two ends were read", () => {
    expect(uptimeClock(-5)).toBe("00:00:00");
  });
});

// The runners and the editors write their rows into one table, so each block of the board takes
// the rows whose agent is of its own kind and leaves the rest alone.
describe("which block a finished run stands in", () => {
  const runner: RunnerRecord = {
    id: 5,
    agent: "search",
    unit: "bmo-search-1788000000-7f3a",
    chatId: -1001,
    depth: "thorough",
    capSeconds: null,
    startedAt: 1_788_000_000,
    finishedAt: 1_788_000_120,
    outcome: "done"
  };

  const batch: RunnerRecord = {
    id: 6,
    agent: "digest",
    unit: "bmo-digest",
    chatId: -1001,
    depth: null,
    capSeconds: null,
    startedAt: 1_788_000_300,
    finishedAt: 1_788_001_000,
    outcome: "done"
  };

});

// Every way a job can end, as bmo-job records its runs, is named for a person on this console. An ending
// forgotten here would reach the board as its own raw slug wearing no tone at all — which is what a reader sees
// the first time a new ending happens, and the one time it matters most — so the console is held to the list.
describe("the endings the board has a word for", () => {
  const endings = ["done", "failed", "live-tasks", "unclosed", "limit", "error", "died", "blocked"];

  test("there is a list to read, so nothing below passes on an empty one", () => {
    expect(endings.length).toBeGreaterThan(4);
    expect(endings).toContain("done");
  });

  test("every one of them reads as words rather than as its own slug", () => {
    for (const ending of endings) {
      expect({ ending, label: outcomeLabel(wording, ending) }).not.toEqual({ ending, label: ending });
    }
  });

});

