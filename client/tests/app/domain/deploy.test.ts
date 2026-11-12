import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { deployMarkOf, ENDING_SHOWN_MS, holdLimit, holdWaits, itemDeployPhase, stageRows, stageSpans, stepLabel } from "../../../apps/web/app/domain/deploy";
import type { ItemOnItsWayLive } from "../../../apps/web/app/domain/deploy";

import type { DeployRunView, DeployView } from "../../../apps/web/shared/types";
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
    outcome: null,
    commit: "c".repeat(40),
    carried: [],
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
    expect(deployMarkOf(wording, view({ run: run({ unitName: "unit-a", phase: "ended", outcome: "live", endedAt: NOW - 1_000 }) }), RELEASE, NOW)?.detail).toBe("unit-a");
    expect(deployMarkOf(wording, view({ run: run({ unitName: "unit-a", phase: "cut", endedAt: NOW - 1_000 }) }), RELEASE, NOW)?.detail).toBe(`unit-a · ${wording("deploy.label.stage_build")}`);
  });

  test("a hold with no run under way stands as the hold, named by the items it goes up after, and a run under way stands before it", () => {
    const hold = { since: 0, until: NOW / 1000 + 3 * 3600 + 5, commits: [], breaks: [], waitingOn: ["w1", "w2"], waitingFor: [1389], passing: [] };
    const ended = run({ phase: "ended", outcome: "live", endedAt: NOW - 1_000 });

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
    const rolled = run({ phase: "ended", outcome: "rolled-back", endedAt: NOW - 1_000 });
    const stopped = run({ phase: "ended", outcome: "stopped", endedAt: NOW - 1_000 });
    const cut = run({ phase: "cut", endedAt: NOW - 1_000 });

    expect(deployMarkOf(wording, view({ run: rolled }), RELEASE, NOW)).toMatchObject({ kind: "ended", tone: "error", label: wording("deploy.status.rolled_back") });
    expect(deployMarkOf(wording, view({ run: stopped }), RELEASE, NOW)).toMatchObject({ tone: "warning", label: wording("deploy.status.stopped"), detail: "" });
    expect(deployMarkOf(wording, view({ run: cut }), RELEASE, NOW)).toMatchObject({ label: wording("deploy.status.cut"), detail: wording("deploy.label.stage_build") });
    expect(deployMarkOf(wording, view({ run: rolled }), RELEASE, NOW + ENDING_SHOWN_MS)).toBeNull();
    expect(deployMarkOf(wording, view({ run: rolled }), "build-old", NOW + ENDING_SHOWN_MS)).toMatchObject({ kind: "newer", label: wording("deploy.status.newer") });
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
    const ended = run({ phase: "ended", outcome: "stopped", endedAt: NOW, plan: ["check", "build", "after"], ahead: [{ name: "tests" }], running: { name: "quick", at: NOW - 1_000 } });

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
  const waiting = (commit: string | null): ItemOnItsWayLive["closing"] => ({ phase: "waiting-live", commit });

  test("is being tested while the check stage is under way, and before the first stage of a plan that opens with it", () => {
    const testing = view({ run: run({ carried, stages: [{ stage: "check", at: NOW - 1_000 }] }) });

    expect(itemDeployPhase(testing, item(1201))).toBe("testing");
    expect(itemDeployPhase(testing, item(1202))).toBe("testing");
    expect(itemDeployPhase(view({ run: run({ carried, plan: ["check", "build"], stages: [] }) }), item(1201))).toBe("testing");
  });

  test("is being put live through every later stage until the run ends", () => {
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1201))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ carried, stages: [{ stage: "restart", at: NOW }] }) }), item(1202))).toBe("deploying");
  });

  test("is carried by a run whose commit is the one its close handed over, named whole or shortened", () => {
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1203, { closing: waiting("c".repeat(12)) }))).toBe("deploying");
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1203, { closing: waiting("d".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1203, { closing: waiting("ccc") }))).toBe("waiting-live");
  });

  test("is being tested while a job of it runs its close, and says nothing of a close no job runs", () => {
    const closing: ItemOnItsWayLive["closing"] = { phase: "testing", commit: null };

    expect(itemDeployPhase(view(), item(1203, { closing, liveState: "running" }))).toBe("testing");
    expect(itemDeployPhase(null, item(1203, { closing, liveState: "running" }))).toBe("testing");
    expect(itemDeployPhase(view(), item(1203, { closing }))).toBeNull();
  });

  test("waits to go live once its close handed its commit over and no job of it runs", () => {
    expect(itemDeployPhase(view(), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(view(), item(1203, { closing: waiting(null) }))).toBe("waiting-live");
    expect(itemDeployPhase(view(), item(1203, { closing: waiting("c".repeat(40)), liveState: "running" }))).toBeNull();
    expect(itemDeployPhase(view({ run: run({ carried, phase: "ended", endedAt: NOW, outcome: "live" }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
  });

  test("says its deployment failed where the run that carried its commit ended failed or rolled back", () => {
    const failed = view({ run: run({ carried, phase: "ended", endedAt: NOW, outcome: "failed" }) });
    const rolledBack = view({ run: run({ carried, phase: "ended", endedAt: NOW, outcome: "rolled-back" }) });

    expect(itemDeployPhase(failed, item(1203, { closing: waiting("c".repeat(40)) }))).toBe("deploy-failed");
    expect(itemDeployPhase(rolledBack, item(1203, { closing: waiting("c".repeat(40)) }))).toBe("deploy-failed");
    expect(itemDeployPhase(failed, item(1203, { closing: waiting("d".repeat(40)) }))).toBe("waiting-live");
    expect(itemDeployPhase(failed, item(1203, { closing: waiting("c".repeat(40)), liveState: "running" }))).toBeNull();
    expect(itemDeployPhase(view({ run: run({ carried, phase: "ended", endedAt: NOW, outcome: "stopped" }) }), item(1203, { closing: waiting("c".repeat(40)) }))).toBe("waiting-live");
  });

  test("says nothing of an item no commit names, of a run that ended, of a finished item, or with no run", () => {
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1204))).toBeNull();
    expect(itemDeployPhase(view({ run: run({ carried, phase: "ended", endedAt: NOW, outcome: "live" }) }), item(1201))).toBeNull();
    expect(itemDeployPhase(view({ run: run({ carried }) }), item(1201, { done: true }))).toBeNull();
    expect(itemDeployPhase(view(), item(1201, { done: true, closing: waiting("c".repeat(40)) }))).toBeNull();
    expect(itemDeployPhase(view(), item(1201))).toBeNull();
    expect(itemDeployPhase(null, item(1201))).toBeNull();
  });
});
