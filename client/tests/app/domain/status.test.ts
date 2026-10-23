import { beforeEach, describe, expect, test } from "bun:test";
import { conversationOf } from "../../support/conversation";
import { WORKER } from "../../support/ids";

import { wording } from "../../../apps/web/shared/wording";

import { holdCatalogue } from "../../../apps/web/app/domain/agents";

import {
  agentStartText,
  gateOutcome,
  gateRows,
  isLiveTab,
  jobRows,
  liveRunLink,
  modeLabel,
  modelLabel,
  outcomeLabel,
  outcomeTone,
  runningWorkLabel,
  waitingLabel,
  workLabel,
  runRows,
  liveTabLabel,
  LIVE_TABS,
  statusGroups,
  stopTargetOf,
  stoppable,
  uptimeClock,
  watchStopTarget
} from "../../../apps/web/app/domain/status";

import type { AgentSummary, GateRunRecord, JobRecord, LiveRun, RoomSummary, RunnerRecord } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/status.test.ko.json";

function gateRun(verdict: string): GateRunRecord {
  return { id: 1, agent: "content-judge", chatId: -1001, messageId: 7, verdict, ms: 1200, at: 100 };
}

const rooms: RoomSummary[] = [{ chatId: -1001, title: "Alpha Room", messageCount: 0, lastMessageAt: null, pinned: false }];

// The board's groups are the catalogue's own agents, so a test about them puts the catalogue in
// hand the way every screen does.
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
    catalogued("content-judge", "gate", KO.line_75),
    catalogued("search", "runner", KO.line_76),
    catalogued("browse", "runner", KO.line_77),
    catalogued("digest", "editor", KO.line_78),
    catalogued("worker", "worker", KO.line_79)
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

describe("the groups the live board watches", () => {
  test("are the four that run, under the catalogue's own names", () => {
    expect(statusGroups(wording).map((group) => group.key)).toEqual(["gate", "runner", "editor", "worker"]);
    expect(statusGroups(wording).map((group) => group.label)).toEqual([KO.line_100, wording("agents.label.group_runner"), wording("agents.label.group_recollector"), KO.line_100_2]);
    expect(statusGroups(wording)[1]?.agents.map((agent) => agent.label)).toEqual([KO.line_101, KO.line_101_2]);
    expect(statusGroups(wording)[2]?.agents.map((agent) => agent.label)).toEqual([KO.line_102]);
  });

  test("carry a worker the owner added, since the catalogue is where they come from", () => {
    holdCatalogue([catalogued("worker", "worker", KO.line_106), catalogued("infra", "worker", KO.line_106_2)]);

    expect(statusGroups(wording).find((group) => group.key === "worker")?.agents.map((agent) => agent.label)).toEqual([
      KO.line_109,
      KO.line_110
    ]);
  });
});

describe("the board's sections", () => {
  test("stand as one tab each: the pool, every group of runs, then the transport records", () => {
    expect(LIVE_TABS.map((tab) => tab.value)).toEqual(["pool", "gate", "runner", "editor", "worker", "executions"]);
    expect(LIVE_TABS.map((tab) => wording(tab.label))).toEqual([wording("live.label.tab_pool"), KO.line_118, wording("agents.label.group_runner"), wording("agents.label.group_recollector"), KO.line_118_2, "Herdr"]);
    // Every tab wears a mark, since the row is read at a glance and on a phone.
    expect(LIVE_TABS.every((tab) => tab.icon.startsWith("i-material-symbols-"))).toBe(true);
  });

  test("name a group of runs by the catalogue's own name for that branch", () => {
    for (const key of ["gate", "runner", "editor", "worker"] as const) {
      expect(liveTabLabel(wording, key)).toBe(statusGroups(wording).find((group) => group.key === key)!.label);
    }
  });

  test("only these are read back from an address", () => {
    expect(isLiveTab("pool")).toBe(true);
    expect(isLiveTab("gate")).toBe(true);
    expect(isLiveTab("editor")).toBe(true);
    expect(isLiveTab("executions")).toBe(true);
    expect(isLiveTab("all")).toBe(false);
    expect(isLiveTab("chat")).toBe(false);
    expect(isLiveTab(null)).toBe(false);
  });
});

describe("a gate's chip", () => {
  test("folds whatever the gate said into one of three states", () => {
    expect(gateOutcome(wording, "PASS")).toBe(wording("live.label.gate_passed"));
    expect(gateOutcome(wording, KO.line_143)).toBe(wording("live.label.gate_passed"));
    expect(gateOutcome(wording, KO.line_144)).toBe(wording("live.label.gate_refused"));
    expect(gateOutcome(wording, "SKIP")).toBe(KO.line_145);
  });

  test("carries the state alone, never what the gate wrote", () => {
    const row = gateRows(wording, [gateRun(KO.line_149)], rooms)[0];

    expect(row?.outcome).toBe(wording("live.label.gate_refused"));
    expect(row?.tone).toBe("error");
    expect(row?.room).toBe("Alpha Room");
    expect(row?.note).toBe("#7");
  });
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

  test("a finished runner run: its own agent's log, at the run the unit's name stands for", () => {
    expect(runRows(wording, [runner], [], rooms, "runner")[0]?.to).toBe("/agents/search?run=bmo-search-1788000000-7f3a");
  });

  test("a finished editor batch: its own agent's log, at the second that batch began", () => {
    const batch: RunnerRecord = {
      ...runner,
      id: 6,
      agent: "digest",
      unit: "bmo-digest",
      depth: null
    };

    // An editor works batch after batch inside one unit, so the unit's name would not pick out
    // one of them; the second it began does.
    expect(runRows(wording, [batch], [], rooms, "editor")[0]?.to).toBe("/agents/digest?at=1788000000");
  });

  // A job with no item is not numbered; it stands under the line its launcher wrote for why.
  test("a finished job with no item wears why it was launched, and one from before that wears no label", () => {
    const why = KO.line_224;

    expect(jobRows(wording, [{ ...job, todoId: null, attempt: 0, purpose: why }], [], rooms)[0]?.note).toBe(`${why} · Opus 5`);
    expect(workLabel(wording, { todoId: null, purpose: null })).toBeNull();
    expect(workLabel(wording, { todoId: 26, purpose: why })).toBe(KO.line_228);
  });

  test("a finished job: the worker's log, at the run its own unit stands for", () => {
    expect(jobRows(wording, [job], [], rooms)[0]?.to).toBe("/agents/worker?run=bmo-job-1788000500-91cd");
  });

  // A job the owner stopped closed with ok false, but it did not fail: it reads as stopped.
  test(KO.line_236, () => {
    const row = jobRows(wording, [{ ...job, outcome: "stopped", ok: false }], [], rooms)[0];
    expect(row?.outcome).toBe(KO.line_238);
    expect(row?.tone).toBe("warning");
    expect(jobRows(wording, [{ ...job, outcome: "failed", ok: false }], [], rooms)[0]?.tone).toBe("error");
  });

  test("a job of another worker: that worker's own name and that worker's own log", () => {
    holdCatalogue([catalogued("worker", "worker", KO.line_244), catalogued("infra", "worker", KO.line_244_2)]);

    const row = jobRows(wording, [{ ...job, worker: "infra" }], [], rooms)[0];

    // A right name over a wrong link is half a fix: the reader presses the row and lands in
    // somebody else's log.
    expect(row?.agent).toBe(KO.line_250);
    expect(row?.to).toBe("/agents/infra?run=bmo-job-1788000500-91cd");
  });

  test("a gate's verdict: that gate's log, at the second the run behind it began, in that room", () => {
    expect(gateRows(wording, [gateRun("PASS")], rooms)[0]?.to).toBe("/agents/content-judge?at=99&chat=-1001");
    expect(gateRows(wording, [{ ...gateRun("PASS"), ms: null }], rooms)[0]?.to).toBe("/agents/content-judge?at=100&chat=-1001");
  });

  test("a run still going: the end of that agent's log, where its next line lands", () => {
    expect(liveRunLink(live("runner", "browse", 5))).toBe("/agents/browse");
    expect(liveRunLink(live("worker", "worker", 9))).toBe("/agents/worker");
    expect(liveRunLink(live("gate", "output-verify", 3))).toBe("/agents/output-verify");
  });

  test("a run still going is not in the recent list twice over", () => {
    expect(runRows(wording, [runner], [live("runner", "search", 5)], rooms, "runner")).toEqual([]);
    expect(jobRows(wording, [job], [live("worker", "worker", 9)], rooms)).toEqual([]);
  });

  describe("what a finished run is called on the board", () => {
    test("the item it was a run of, with the model beside it", () => {
      expect(jobRows(wording, [job], [], rooms)[0]?.note).toBe(KO.line_272);
    });

    test("a second run of the same item says which attempt it was", () => {
      expect(jobRows(wording, [{ ...job, attempt: 2 }], [], rooms)[0]?.note).toBe(KO.line_276);
    });

    test("a row an older bot published, with no item on it at all, wears no number either", () => {
      const stale = { ...job } as Record<string, unknown>;

      delete stale.todoId;
      delete stale.attempt;

      expect(jobRows(wording, [stale as unknown as JobRecord], [], rooms)[0]?.note).toBe("Opus 5");
    });

    test("a run nobody filed an item for wears no number", () => {
      const bare = jobRows(wording, [{ ...job, todoId: null, attempt: 0, model: null }], [], rooms)[0];

      expect(bare?.note).toBeNull();
    });

    test("no row on the board carries a job number", () => {
      for (const row of jobRows(wording, [job, { ...job, id: 2, attempt: 2 }], [], rooms)) {
        expect(row.note ?? "").not.toContain("Job #");
      }
    });
  });

  // A run still going is read for where the work stands: a step of a work order wears how far
  // that order has come, and anything else wears its item alone, never a count of runs.
  describe("what a run still going is called", () => {
    test("a step of a work order wears how far its order has come", () => {
      expect(runningWorkLabel(wording, { ...live("worker", "worker", 1), todoId: 257, progress: KO.line_305 })).toBe(
        KO.line_306
      );
    });

    test("a one-session job wears its item alone, and a run of no item wears why it was launched", () => {
      expect(runningWorkLabel(wording, { ...live("worker", "worker", 1), todoId: 26 })).toBe(KO.line_311);
      expect(runningWorkLabel(wording, { ...live("worker", "worker", 1), purpose: KO.line_312 })).toBe(KO.line_312);
      // A run from before launches had to say has nothing to wear.
      expect(runningWorkLabel(wording, live("worker", "worker", 1))).toBeNull();
    });

    test("a job standing still says on what", () => {
      expect(waitingLabel(wording, { waiting: "confirmation" })).toBe(wording("live.status.waiting_confirmation"));
      expect(waitingLabel(wording, { waiting: "question" })).toBe(wording("live.status.waiting_answer"));
      expect(waitingLabel(wording, { waiting: null })).toBeNull();
      expect(waitingLabel(wording, {})).toBeNull();
    });
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

  test("carries what the bot named, whichever kind it is", () => {
    expect(stopTargetOf(row({ unit: "bmo-search-1", stop: { kind: "unit", id: "bmo-search-1" } })))
      .toEqual({ kind: "unit", id: "bmo-search-1" });
    // A gate stands in no unit and is named by the execution it opened.
    expect(stopTargetOf(row({ kind: "gate", agent: "content-judge", stop: { kind: "execution", id: "bmo-execution-judge" } })))
      .toEqual({ kind: "execution", id: "bmo-execution-judge" });
    expect(stoppable(row({ stop: { kind: "execution", id: "bmo-execution-judge" } }))).toBe(true);
  });

  test("falls back to the unit for a picture drawn before rows named one, and to nothing at all otherwise", () => {
    expect(stopTargetOf(row({ unit: "bmo-search-1" }))).toEqual({ kind: "unit", id: "bmo-search-1" });
    expect(stopTargetOf(row({}))).toBeNull();
    expect(stoppable(row({}))).toBe(false);
    // A row the bot says has nothing to aim at wears no button, whatever unit it stands in.
    expect(stopTargetOf(row({ unit: "bmo-search-1", stop: null }))).toBeNull();
  });

  test("a watch is stopped by the run holding it, and one no run holds by nothing", () => {
    expect(watchStopTarget({ unit: "bmo-watch-1-a", stop: { kind: "unit", id: "bmo-watch-1-a" } }))
      .toEqual({ kind: "unit", id: "bmo-watch-1-a" });
    expect(watchStopTarget({ unit: null, stop: null })).toBeNull();
  });
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

  test("the runners' block holds the runners and the editors' block holds the editors", () => {
    expect(runRows(wording, [runner, batch], [], rooms, "runner").map((row) => row.agent)).toEqual([KO.line_409]);
    expect(runRows(wording, [runner, batch], [], rooms, "editor").map((row) => row.agent)).toEqual([KO.line_410]);
  });

  test("an agent the catalogue says nothing about stands with the runners", () => {
    holdCatalogue([]);

    // A run standing in a unit of its own under a name the catalogue does not hold is a runner,
    // which is where an unknown name reads.
    expect(runRows(wording, [batch], [], rooms, "runner").map((row) => row.agent)).toEqual(["digest"]);
    expect(runRows(wording, [batch], [], rooms, "editor")).toEqual([]);
  });
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

  test("and every one of them wears a tone of its own", () => {
    for (const ending of endings) {
      expect({ ending, tone: outcomeTone(ending) }).not.toEqual({ ending, tone: "neutral" });
    }
  });
});

describe("what an agent begins on", () => {
  test("names the provider and the model as the bot named them, and by the console's own names where it did not", () => {
    expect(agentStartText(wording, { configuredMode: "registered", configuredLabel: KO.line_455, model: "model-a-0-1", modelLabel: "Model A 0.1" })).toBe(KO.line_455_2);
    expect(agentStartText(wording, { configuredMode: "claude-code", model: "claude-opus-5-5" })).toBe(`Claude Code · ${modelLabel("claude-opus-5-5")}`);
    expect(agentStartText(wording, { configuredMode: null, model: null })).toBe("");
  });
});
