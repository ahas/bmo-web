import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { deployMarkOf, ENDING_SHOWN_MS, holdLimit, holdWaits, ITEM_DEPLOY_COLOURS, itemDeployPhase, itemWaysLive, itemWayLiveLabel, stageRows, stageSpans, standingRun, stepLabel, withDeploying } from "../../../apps/web/app/domain/deploy";
import type { TodoBoard, TodoItem } from "../../../apps/web/shared/types";
import type { ItemOnItsWayLive } from "../../../apps/web/app/domain/deploy";

import type { DeployRunView, DeployView, DeployWaiting } from "../../../apps/web/shared/types";
import type { DeployStep } from "../../../apps/web/shared/deploy-progress";

// The deployment mark of the title bar (docs/web.md, 「Deployment in the title bar」): which state
// stands, in what words, and when it goes.

// The app configuration bmo-ui reads its zone and locales from, as the console sets it, which a test of the module
// alone does not bring with it.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

const RELEASE = "build-a";
const NOW = 1_800_000_000_000;
// The time since the run below began, 754 seconds, as the mark says it.
const CLOCK = wording("common.label.minutes_seconds", { m: "12", s: "34" });

function run(over: Partial<DeployRunView> = {}): DeployRunView {
  return {
    unitName: null,
    phase: "running",
    startedAt: NOW - 754_000,
    endedAt: null,
    end: null,
    commit: "c".repeat(40),
    brings: [],
    plan: [],
    stages: [{ stage: "check", at: NOW - 754_000 }, { stage: "build", at: NOW - 60_000 }],
    steps: [],
    ahead: [],
    running: null,
    ...over,
  };
}

function view(over: Partial<DeployView> = {}): DeployView {
  return { release: RELEASE, detailed: true, run: null, hold: null, ...over };
}

describe("the deployment mark", () => {
  test("stands nowhere while nothing is deployed and the page is the console's own build", () => {
    expect(deployMarkOf(wording, view(), RELEASE, NOW)).toBeNull();
    expect(deployMarkOf(wording, null, RELEASE, NOW)).toBeNull();
  });

  test("names the stage and the time since the run began, and stands nothing of it for a member", () => {
    expect(deployMarkOf(wording, view({ run: run() }), RELEASE, NOW)).toMatchObject({ kind: "running", spin: true, label: wording("deploy.status.running"), detail: `${wording("deploy.label.stage_build")} · ${CLOCK}` });
    expect(deployMarkOf(wording, view({ run: run({ stages: [] }), detailed: false }), RELEASE, NOW)).toBeNull();
  });

  test("names the unit whose run it is ahead of the rest, under way and ended alike", () => {
    expect(deployMarkOf(wording, view({ run: run({ unitName: "unit-a" }) }), RELEASE, NOW)?.detail).toBe(`unit-a · ${wording("deploy.label.stage_build")} · ${CLOCK}`);
    expect(deployMarkOf(wording, view({ run: run({ unitName: "unit-a", phase: "ended", end: "live", endedAt: NOW - 1_000 }) }), RELEASE, NOW)?.detail).toBe("unit-a");
    expect(deployMarkOf(wording, view({ run: run({ unitName: "unit-a", phase: "cut", end: "withdrawn", endedAt: NOW - 1_000 }) }), RELEASE, NOW)?.detail).toBe(`unit-a · ${wording("deploy.label.stage_build")}`);
  });

  test("a hold with no run under way stands as the hold, named by the items it goes up after, and a run under way stands before it", () => {
    const hold = { since: 0, until: NOW / 1000 + 3 * 3600 + 5, commits: [], breaks: [], waitingOn: ["w1", "w2"], waitingFor: [1389], passing: [] };
    const ended = run({ phase: "ended", end: "live", endedAt: NOW - 1_000 });

    expect(deployMarkOf(wording, view({ hold }), RELEASE, NOW)).toMatchObject({ kind: "hold", label: wording("deploy.status.hold"), detail: wording("todo.status.deploy_hold_after", { items: "#1389" }) });
    expect(deployMarkOf(wording, view({ run: ended, hold }), RELEASE, NOW)?.kind).toBe("hold");
    expect(deployMarkOf(wording, view({ run: run(), hold }), RELEASE, NOW)?.kind).toBe("running");
  });

  test("a hold says the time it gives up at as the limit it is, and how many Jobs where their items are unknown", () => {
    const hold = { since: 0, until: 1_791_398_220, commits: [], breaks: [], waitingOn: ["w1", "w2"], waitingFor: null, passing: [] };

    expect(holdWaits(wording, hold)).toBe(wording("todo.status.deploy_hold_jobs", { n: "2" }));
    expect(holdWaits(wording, { ...hold, waitingFor: [1389, 1390] })).toBe(wording("todo.status.deploy_hold_after", { items: "#1389, #1390" }));
    expect(holdWaits(wording, { ...hold, waitingOn: [] })).toBe(wording("todo.status.deploy_hold_no_jobs"));
    expect(holdLimit(wording, hold)).toBe(wording("todo.status.deploy_hold_limit", { time: "03:37" }));
  });

  test("an ending stands two minutes with its outcome, then gives way to a page older than the console", () => {
    const rolled = run({ phase: "ended", end: "rolled-back", endedAt: NOW - 1_000 });
    const refused = run({ phase: "ended", end: "refused", stages: [], endedAt: NOW - 1_000 });
    const withdrawn = run({ phase: "cut", end: "withdrawn", endedAt: NOW - 1_000 });

    expect(deployMarkOf(wording, view({ run: rolled }), RELEASE, NOW)).toMatchObject({ kind: "ended", tone: "error", label: wording("deploy.status.rolled_back") });
    expect(deployMarkOf(wording, view({ run: refused }), RELEASE, NOW)).toMatchObject({ tone: "warning", label: wording("deploy.status.refused"), detail: "" });
    expect(deployMarkOf(wording, view({ run: withdrawn }), RELEASE, NOW)).toMatchObject({ tone: "neutral", label: wording("deploy.status.withdrawn"), detail: wording("deploy.label.stage_build") });
    expect(deployMarkOf(wording, view({ run: rolled }), RELEASE, NOW + ENDING_SHOWN_MS)).toBeNull();
    expect(deployMarkOf(wording, view({ run: rolled }), "build-old", NOW + ENDING_SHOWN_MS)).toMatchObject({ kind: "newer", label: wording("deploy.status.newer") });
  });

  // A gate that did not pass, a stage after it, a run gone unasked: each a failure at its stage, and why where a step says it.
  test("a failed run names the stage it failed at and the step that failed it, a hung step by what hung it", () => {
    const step = (name: string, code: number, stage: DeployStep["stage"]): DeployStep => ({ name, code, waitedSeconds: 0, ranSeconds: 1, at: NOW - 2_000, stage });
    const gate = run({ phase: "ended", end: "failed", endedAt: NOW - 1_000, stages: [{ stage: "check", at: NOW - 9_000 }], steps: [step("quick", 0, "check"), step("tests", 124, "check")] });
    const build = run({ phase: "ended", end: "failed", endedAt: NOW - 1_000, steps: [step("release", 101, "build")] });
    const rolled = run({ phase: "ended", end: "rolled-back", endedAt: NOW - 1_000, stages: [{ stage: "restart", at: NOW - 9_000 }, { stage: "rollback", at: NOW - 2_000 }] });
    const gone = run({ unitName: "unit-a", phase: "cut", end: "failed", endedAt: NOW - 1_000 });

    expect(deployMarkOf(wording, view({ run: gate }), RELEASE, NOW)).toMatchObject({ kind: "ended", tone: "error", label: wording("deploy.status.failed"), detail: `${wording("deploy.label.stage_check")} · ${wording("deploy.label.step_hung", { step: "tests" })}` });
    expect(deployMarkOf(wording, view({ run: build }), RELEASE, NOW)?.detail).toBe(`${wording("deploy.label.stage_build")} · ${wording("deploy.label.step_failed", { step: "release", code: 101 })}`);
    expect(deployMarkOf(wording, view({ run: rolled }), RELEASE, NOW)?.detail).toBe(wording("deploy.label.stage_restart"));
    // A step that failed in a stage the run went on past is not why it failed.
    expect(deployMarkOf(wording, view({ run: run({ phase: "ended", end: "failed", endedAt: NOW - 1_000, steps: [step("tests", 1, "check")] }) }), RELEASE, NOW)?.detail).toBe(wording("deploy.label.stage_build"));
    expect(deployMarkOf(wording, view({ run: gone }), RELEASE, NOW)).toMatchObject({ tone: "error", label: wording("deploy.status.failed"), detail: `unit-a · ${wording("deploy.label.stage_build")}` });
  });

  test("each stage lasts until the next began, and the last one until now while the run goes", () => {
    expect(stageSpans(run(), NOW).map((span) => [span.stage, span.seconds, span.current])).toEqual([["check", 694, false], ["build", 60, true]]);
  });

  test("each heavy step stands under the stage it ended in, a part of its stage by the part alone", () => {
    const step = (name: string, at: number, ranSeconds: number, over: Partial<DeployStep> = {}): DeployStep => ({ name, code: 0, waitedSeconds: 0, ranSeconds, at, ...over });
    const deploying = run({
      stages: [{ stage: "check", at: NOW - 900_000 }, { stage: "backup", at: NOW - 70_000 }, { stage: "tree", at: NOW - 10_000 }],
      steps: [
        step("queue wait", NOW - 899_000, 0, { stage: "check" }),
        step("type check", NOW - 800_000, 48, { stage: "check" }),
        step("tests", NOW - 80_000, 398, { stage: "check" }),
        step("backup snapshot", NOW - 59_000, 11, { stage: "backup", part: "snapshot" }),
        step("backup pack", NOW - 15_000, 44, { stage: "backup", part: "pack" }),
        step("backup check", NOW - 10_000, 5, { stage: "backup", part: "check" }),
      ],
    });

    expect(stageSpans(deploying, NOW).map((span) => [span.stage, span.steps.map((one) => [stepLabel(wording, one), one.ranSeconds])])).toEqual([
      ["check", [["queue wait", 0], ["type check", 48], ["tests", 398]]],
      ["backup", [[wording("deploy.label.part_snapshot"), 11], [wording("deploy.label.part_pack"), 44], [wording("deploy.label.part_check"), 5]]],
      ["tree", []],
    ]);
  });

  test("every planned stage stands from the start, those passed done, the one under way current and the rest ahead in order", () => {
    const planned = run({ plan: ["check", "backup", "tree", "build", "after"], stages: [] });

    expect(stageRows(planned, NOW).map((row) => [row.stage, row.state, row.seconds])).toEqual([
      ["check", "ahead", null],
      ["backup", "ahead", null],
      ["tree", "ahead", null],
      ["build", "ahead", null],
      ["after", "ahead", null],
    ]);

    // A stage passed over drops out once a later stage is reached.
    const going = run({ plan: planned.plan, stages: [{ stage: "check", at: NOW - 100_000 }, { stage: "tree", at: NOW - 10_000 }] });

    expect(stageRows(going, NOW).map((row) => [row.key, row.state, row.seconds])).toEqual([
      ["check#0", "done", 90],
      ["tree#0", "current", 10],
      ["build#0", "ahead", null],
      ["after#0", "ahead", null],
    ]);
  });

  test("under the stage under way, the ended steps with their wait and run, the running one ticking, then those ahead", () => {
    const checking = run({
      plan: ["check", "backup"],
      stages: [{ stage: "check", at: NOW - 300_000 }],
      steps: [
        { name: "turn", code: 0, waitedSeconds: 20, ranSeconds: 0, at: NOW - 280_000, stage: "check" },
        { name: "types", code: 2, waitedSeconds: 0, ranSeconds: 40, at: NOW - 240_000, stage: "check" },
      ],
      running: { name: "tests", stage: "check", at: NOW - 240_000 },
      ahead: [{ name: "after-tests" }],
    });
    const [check, backup] = stageRows(checking, NOW);

    expect(check?.steps.map((row) => [row.key, row.state, row.seconds, row.code])).toEqual([
      ["turn|#0", "done", 20, null],
      ["types|#0", "done", 40, 2],
      ["tests|#0", "current", 240, null],
      ["after-tests|#0", "ahead", null, null],
    ]);
    expect(check?.steps.reduce((sum, row) => sum + (row.seconds ?? 0), 0)).toBe(check?.seconds ?? -1);
    expect(backup).toMatchObject({ stage: "backup", state: "ahead", steps: [] });
  });

  test("a run that ended or was cut off shows only what happened", () => {
    const ended = run({ phase: "ended", end: "failed", endedAt: NOW, plan: ["check", "build", "after"], ahead: [{ name: "tests" }], running: { name: "quick", at: NOW - 1_000 } });

    expect(stageRows(ended, NOW).map((row) => [row.stage, row.state, row.steps.length])).toEqual([["check", "done", 0], ["build", "done", 0]]);
  });

  test("a rollback, which no plan names, has nothing planned after it", () => {
    const rolling = run({ plan: ["build", "restart", "after"], stages: [{ stage: "build", at: NOW - 10_000 }, { stage: "rollback", at: NOW - 1_000 }] });

    expect(stageRows(rolling, NOW).map((row) => row.stage)).toEqual(["build", "rollback"]);
  });

  test("a step written with no stage stands under the stage under way when it ended", () => {
    const steps = [{ name: "type check", code: 0, waitedSeconds: 0, ranSeconds: 48, at: NOW - 700_000 }, { name: "release build", code: 0, waitedSeconds: 0, ranSeconds: 30, at: NOW - 1_000 }];

    expect(stageSpans(run({ steps }), NOW).map((span) => [span.stage, span.steps.map((one) => one.name)])).toEqual([["check", ["type check"]], ["build", ["release build"]]]);
  });
});

// What a TODO row says beside its state of where its item's work stands on its way live (docs/web.md, the TODO
// panel's section).
describe("an item on its way live", () => {
  const carried = [
    { commit: "a".repeat(40), subject: "Fix the panel (#1201)", todoId: null },
    { commit: "b".repeat(40), subject: "Fold two things", todoId: 1202 },
    { commit: "c".repeat(40), subject: "Name no item", todoId: null }
  ];
  const item = (id: number, over: Partial<ItemOnItsWayLive> = {}): ItemOnItsWayLive => ({ id, done: false, liveState: null, closing: null, ...over });
  const waiting = (commit: string | null): ItemOnItsWayLive["closing"] => ({ phase: "waiting-live", waiting: [{ repository: null, commit }] });

  test("marks the board's rows a run under way carries as being put live, and counts them, each phase in a colour of its own", () => {
    const row = (id: number, commit: string) => item(id, { closing: waiting(commit) }) as TodoItem;
    const board = { queue: [row(1201, "x".repeat(40)), row(1203, "d".repeat(40))], standing: { queue: 2, running: 0, deploy: 2, deploying: 0, pending: 0, held: 0, merged: 0 } } as TodoBoard;
    const marked = withDeploying(board, view({ run: run({ brings: carried }) }));

    expect(marked.queue.map((one) => one.deploying === true)).toEqual([true, false]);
    expect(marked.standing.deploying).toBe(1);
    // Read again, a row hands back the one marked item it handed before, so its row is handed nothing new.
    expect(withDeploying(board, view({ run: run({ brings: carried }) })).queue[0]).toBe(marked.queue[0]!);
    expect(withDeploying(board, null).standing.deploying).toBe(0);
    expect(new Set(Object.values(ITEM_DEPLOY_COLOURS)).size).toBe(3);
  });

  test("is being put live while the run's check stage is under way, and before the first stage of a plan that opens with it", () => {
    const checking = view({ run: run({ brings: carried, stages: [{ stage: "check", at: NOW - 1_000 }] }) });

    expect(itemDeployPhase(checking, item(1201))).toBe("deploying");
    expect(itemDeployPhase(checking, item(1202))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ brings: carried, plan: ["check", "build"], stages: [] }) }), item(1201))).toBe("deploying");
  });

  test("is being put live through every later stage until the run ends", () => {
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1201))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ brings: carried, stages: [{ stage: "restart", at: NOW }] }) }), item(1202))).toBe("deploying");
  });

  // Several units deploy at once: a run under way that the title bar does not stand still says it carries the item.
  test("is being put live by any run under way that carries it, not only the one the bar stands", () => {
    const other = run({ brings: [{ commit: "e".repeat(40), subject: "Keep the toolbar small", todoId: null }] });
    const behind = run({ brings: carried, stages: [{ stage: "restart", at: NOW }] });

    expect(itemDeployPhase(view({ run: other, runs: [other, behind] }), item(1201))).toBe("deploying");
    expect(itemDeployPhase(view({ run: other, runs: [other] }), item(1201, { closing: waiting("a".repeat(40)) }))).toBe("waiting-live");
  });

  test("is carried by a run whose commit is the one its close handed over, named whole or shortened", () => {
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1203, { closing: waiting("c".repeat(12)) }))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1203, { closing: waiting("d".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1203, { closing: waiting("ccc") }))).toBe("waiting-live");
  });

  test("says nothing while a close checks its change before the merge, the row's testbed line saying it", () => {
    const closing: ItemOnItsWayLive["closing"] = { phase: "testing", waiting: [] };

    expect(itemDeployPhase(view(), item(1203, { closing, liveState: "running" }))).toBeNull();
    expect(itemDeployPhase(null, item(1203, { closing, liveState: "running" }))).toBeNull();
    expect(itemDeployPhase(view(), item(1203, { closing }))).toBeNull();
  });

  test("waits to go live once its close merged its commit for its repository's batch deployment", () => {
    const batch = (commit: string | null): ItemOnItsWayLive["closing"] => ({ phase: "waiting-batch", waiting: [{ repository: null, commit }] });

    expect(itemDeployPhase(view(), item(1203, { closing: batch("c".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view(), item(1203, { closing: batch(null), liveState: "running" }))).toBe("waiting-live");
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1203, { closing: batch("c".repeat(40)) }))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "failed" }) }), item(1203, { closing: batch("c".repeat(40)) }))).toBe("deploy-failed");
  });

  test("waits to go live once its close handed its commit over, its job waiting on it or ended", () => {
    expect(itemDeployPhase(view(), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view(), item(1203, { closing: waiting(null) }))).toBe("waiting-live");
    expect(itemDeployPhase(view(), item(1203, { closing: waiting("c".repeat(40)), liveState: "running" }))).toBe("waiting-live");
    expect(itemDeployPhase(view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "live" }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
  });

  test("says its deployment failed where the run that carried its commit ended failed or rolled back, and not where it was refused or withdrawn", () => {
    const failed = view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "failed" }) });
    const rolledBack = view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "rolled-back" }) });

    expect(itemDeployPhase(failed, item(1203, { closing: waiting("c".repeat(40)) }))).toBe("deploy-failed");
    expect(itemDeployPhase(rolledBack, item(1203, { closing: waiting("c".repeat(40)) }))).toBe("deploy-failed");
    expect(itemDeployPhase(failed, item(1203, { closing: waiting("d".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(failed, item(1203, { closing: waiting("c".repeat(40)), liveState: "running" }))).toBe("deploy-failed");
    expect(itemDeployPhase(view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "refused" }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view({ run: run({ brings: carried, phase: "cut", endedAt: NOW, end: "withdrawn" }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
  });

  test("says nothing of an item no commit names, of a run that ended, of a finished item, or with no run", () => {
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1204))).toBeNull();
    expect(itemDeployPhase(view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "live" }) }), item(1201))).toBeNull();
    expect(itemDeployPhase(view({ run: run({ brings: carried }) }), item(1201, { done: true }))).toBeNull();
    expect(itemDeployPhase(view(), item(1201, { done: true, closing: waiting("c".repeat(40)) }))).toBeNull();
    expect(itemDeployPhase(view(), item(1201))).toBeNull();
    expect(itemDeployPhase(null, item(1201))).toBeNull();
  });

  // A run of a commit already live brings nothing: an item an earlier deploy put live is not being put live again.
  test("is carried by nothing a run does not bring live", () => {
    expect(itemDeployPhase(view({ run: run({ brings: [] }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view({ run: run({ brings: [] }) }), item(1201))).toBeNull();
  });

  // An item's commit may go live in another repository than the one the item is assigned to: the row names the
  // unit whose deployment brings it, as the title bar does.
  test("names the unit whose deployment it stands in", () => {
    const drive = run({ unitName: "unit-b", brings: carried });

    expect(itemWaysLive(view({ run: drive, runs: [drive] }), item(1203, { closing: waiting("c".repeat(40)) }))).toEqual([{ phase: "deploying", unitName: "unit-b", repository: null, commit: "c".repeat(40), place: null }]);
    expect(itemWaysLive(view(), item(1203, { closing: waiting("c".repeat(40)) }))).toEqual([{ phase: "waiting-live", unitName: null, repository: null, commit: "c".repeat(40), place: null }]);
    expect(itemWayLiveLabel(wording, { phase: "deploying", unitName: "unit-b", repository: "repo-a", commit: "c".repeat(40), place: null })).toBe(`${wording("todo.label.deploy_deploying")} · unit-b · ${"c".repeat(12)}`);
    expect(itemWayLiveLabel(wording, { phase: "waiting-live", unitName: null, repository: "repo-a", commit: null, place: null })).toBe(`${wording("todo.label.deploy_waiting_live")} · repo-a`);
    expect(itemWayLiveLabel(wording, { phase: "waiting-live", unitName: null, repository: null, commit: null, place: null })).toBe(wording("todo.label.deploy_waiting_live"));
    // A way waiting its turn says which place its deployment stands at in the line.
    expect(itemWayLiveLabel(wording, { phase: "in-line", unitName: "unit-c", repository: null, commit: null, place: 3 })).toBe(`${wording("todo.label.deploy_in_line_at", { n: 3 })} · unit-c`);
  });

  test("waits its turn where a deployment waiting in the line brings it, and a run under way bringing it comes first", () => {
    const line: DeployWaiting[] = [{ unitName: "unit-c", unit: "deploy-c.service", commit: "c".repeat(12), since: NOW - 5_000, brings: carried }];
    const merged = item(1203, { closing: waiting("c".repeat(40)) });

    expect(itemDeployPhase(view({ line }), merged)).toBe("in-line");
    expect(itemWaysLive(view({ line }), item(1201))).toEqual([{ phase: "in-line", unitName: "unit-c", repository: null, commit: null, place: 1 }]);
    expect(itemDeployPhase(view({ line: [{ ...line[0]!, commit: null, brings: [] }] }), merged)).toBe("waiting-live");

    const under = run({ unitName: "unit-c", brings: carried });

    expect(itemDeployPhase(view({ run: under, runs: [under], line }), merged)).toBe("deploying");
  });

  // An item whose work spans repositories waits on a commit of each, and is live only once every one of them is.
  describe("whose work spans repositories", () => {
    const spanning = (phase: "testing" | "waiting-batch" = "waiting-batch"): ItemOnItsWayLive["closing"] => ({
      phase,
      waiting: [{ repository: "repo-a", commit: "c".repeat(40) }, { repository: "repo-b", commit: "d".repeat(40) }]
    });

    test("says where each of its commits stands, in its repository's order, and stands on its way live while any waits", () => {
      const drive = run({ unitName: "unit-b", brings: carried });

      expect(itemWaysLive(view(), item(1203, { closing: spanning() })).map((way) => [way.phase, way.repository])).toEqual([["waiting-live", "repo-a"], ["waiting-live", "repo-b"]]);
      expect(itemWaysLive(view({ run: drive, runs: [drive] }), item(1203, { closing: spanning() })).map((way) => [way.phase, way.unitName, way.commit])).toEqual([
        ["deploying", "unit-b", "c".repeat(40)],
        ["waiting-live", null, "d".repeat(40)]
      ]);
      expect(itemDeployPhase(view({ run: drive, runs: [drive] }), item(1203, { closing: spanning() }))).toBe("deploying");
      expect(itemDeployPhase(view({ run: run({ brings: carried, phase: "ended", endedAt: NOW, end: "live" }) }), item(1203, { closing: spanning() }))).toBe("waiting-live");
    });

    test("fails only the commit the failed run brought", () => {
      const failed = view({ run: run({ unitName: "unit-b", brings: carried, phase: "ended", endedAt: NOW, end: "failed" }) });

      expect(itemWaysLive(failed, item(1203, { closing: spanning() })).map((way) => way.phase)).toEqual(["deploy-failed", "waiting-live"]);
    });

    // A named repository's commit is carried by itself alone; a run that names the item by its number but brings
    // none of its commits says so apart.
    test("says a run carrying the item by its number alone apart from the commits it waits on", () => {
      const named = run({ unitName: "unit-c", brings: [carried[0]!] });

      expect(itemWaysLive(view({ run: named, runs: [named] }), item(1201, { closing: spanning() }))).toEqual([
        { phase: "waiting-live", unitName: null, repository: "repo-a", commit: "c".repeat(40), place: null },
        { phase: "waiting-live", unitName: null, repository: "repo-b", commit: "d".repeat(40), place: null },
        { phase: "deploying", unitName: "unit-c", repository: null, commit: null, place: null }
      ]);
    });

    test("keeps a commit only waiting off the row while a repository's close checks, and a run bringing it on", () => {
      const drive = run({ unitName: "unit-b", brings: carried });

      expect(itemWaysLive(view(), item(1203, { closing: spanning("testing") }))).toEqual([]);
      expect(itemWaysLive(view({ run: drive, runs: [drive] }), item(1203, { closing: spanning("testing") })).map((way) => way.repository)).toEqual(["repo-a"]);
    });

    test("hands an item standing on no way the one empty list, so its row is handed nothing new", () => {
      expect(itemWaysLive(view(), item(1204))).toBe(itemWaysLive(null, item(1205, { done: true })));
    });
  });
});

// The deployments waiting their turn in the testbed's deployment line (docs/web.md, 「Deployment in the title bar」).
describe("the line", () => {
  const waiting = (unitName: string): DeployWaiting => ({ unitName, unit: `deploy-${unitName}.service`, commit: null, since: NOW - 60_000, brings: [] });
  const line = [waiting("unit-a"), waiting("unit-b"), waiting("unit-c")];

  test("stands with no run under way and no hold, the first in the line named and how many stand behind it", () => {
    expect(deployMarkOf(wording, view({ line: [waiting("unit-a")] }), RELEASE, NOW)).toMatchObject({ kind: "line", tone: "info", spin: false, label: wording("deploy.status.line"), detail: "unit-a" });
    expect(deployMarkOf(wording, view({ line }), RELEASE, NOW)?.detail).toBe(wording("deploy.label.line_more", { unit: "unit-a", n: "2" }));
  });

  test("stands behind a run under way and the hold, and before a run that ended", () => {
    const hold = { since: NOW, until: NOW + 60_000, commits: [], breaks: [], waitingOn: [], waitingFor: [1389], passing: [] };

    expect(deployMarkOf(wording, view({ line, run: run() }), RELEASE, NOW)?.kind).toBe("running");
    expect(deployMarkOf(wording, view({ line, hold }), RELEASE, NOW)?.kind).toBe("hold");
    expect(deployMarkOf(wording, view({ line, run: run({ phase: "ended", end: "live", endedAt: NOW - 1_000 }) }), RELEASE, NOW)?.kind).toBe("line");
    expect(deployMarkOf(wording, view({ line, detailed: false }), RELEASE, NOW)).toBeNull();
  });

  test("leaves the popover no run but one under way or ended within its two minutes", () => {
    const ended = run({ phase: "ended", end: "live", endedAt: NOW - 1_000 });

    expect(standingRun(view({ run: run() }), NOW)).not.toBeNull();
    expect(standingRun(view({ run: ended }), NOW)).toBe(ended);
    expect(standingRun(view({ run: ended }), NOW + ENDING_SHOWN_MS)).toBeNull();
    expect(standingRun(view(), NOW)).toBeNull();
  });
});
