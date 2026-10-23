import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scratchDir } from "../../support/scratch";
import { answer, standIn } from "../../support/units";

import type { DeployProgress } from "../../../apps/web/shared/deploy-progress";

// What `/api/deploy` hands a tab (docs/web.md, 「Deployment in the title bar」): the testbed's progress record of every
// deploy root the setting lists, in the shape the testbed writes it, the run the mark stands among them named by its
// unit, and the deployment's hold as bmo-job keeps it.

const scratch = scratchDir("bmo-web-deploy-");

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let holding: unknown = null;

standIn("JOB", (one) => (one.path.startsWith("/queues")
  ? answer({
      items: [{
        name: "default",
        state: "open",
        holds: holding === null ? [] : [{ actorName: "deploy", reason: "a job", until: 9_000 }],
        leasedCount: 0,
        openCount: 0,
        changedAt: 0
      }],
      more: false
    })
  : answer({ code: "not_found" }, 404)));

const { deployRoots, deployViewFor, readDeployHoldRow, readDeployReading, readDeployReadings, shownReading } = await import("../../../apps/web/server/utils/deploy");

const record: DeployProgress = {
  unit: "deploy-unit-a",
  pid: 42,
  commit: "c".repeat(40),
  startedAt: 1_000,
  plan: ["backup", "restart", "after"],
  stages: [{ stage: "backup", at: 1_500 }, { stage: "restart", at: 2_000 }],
  steps: [
    { name: "pack the backup", part: "pack", stage: "backup", code: 0, waitedSeconds: 0, ranSeconds: 0.3, at: 1_800 },
    { name: "release build", stage: "restart", code: 0, waitedSeconds: 1, ranSeconds: 2, at: 1_900 }
  ],
  ahead: [{ name: "after-step" }],
  running: { name: "wait", stage: "restart", at: 2_100 },
  rolledBack: false,
  ending: null
};
const hold = { since: 1, until: 2, commits: [], breaks: [], waitingOn: [], waitingFor: [], passing: [] };

describe("the record", () => {
  test("is read under every deploy root the setting lists, as the testbed writes it, named by its root's folder", () => {
    const root = join(scratch, "unit-a");

    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "deploy-progress.json"), `${JSON.stringify(record, null, 2)}\n`);

    expect(deployRoots({ DEPLOY_ROOTS: `${root}: ${join(scratch, "unit-b")} :` })).toEqual([root, join(scratch, "unit-b")]);

    const [read, none] = readDeployReadings([root, join(scratch, "unit-b")]);

    expect(read).toMatchObject({ unitName: "unit-a", record });
    expect(read!.writtenAt).toBeGreaterThan(0);
    expect(none).toEqual({ unitName: "unit-b", record: null, writtenAt: null });
  });

  test("is none where no path is named, the file is missing or it does not read as a record", () => {
    const broken = join(scratch, "broken.json");

    writeFileSync(broken, "{ not json");

    expect(deployRoots({})).toEqual([]);
    expect(readDeployReading(null)).toEqual({ record: null, writtenAt: null });
    expect(readDeployReading(join(scratch, "missing.json")).record).toBeNull();
    expect(readDeployReading(broken).record).toBeNull();
  });

  test("leaves off a stage it does not know rather than the record", () => {
    const path = join(scratch, "unknown-stage.json");

    writeFileSync(path, JSON.stringify({ ...record, stages: [...record.stages, { stage: "elsewhere", at: 3_000 }] }));

    expect(readDeployReading(path).record?.stages).toEqual(record.stages);
  });
});

describe("the run the mark stands", () => {
  const reading = (unitName: string, over: Partial<DeployProgress>, writtenAt = 0) => ({ unitName, record: { ...record, ...over }, writtenAt });

  test("is a run under way before any that ended, the one begun last where several run", () => {
    const shown = shownReading([reading("unit-a", { pid: 1, startedAt: 1_000 }), reading("unit-b", { pid: 2, startedAt: 2_000 }), reading("unit-c", { pid: 3, startedAt: 9_000, ending: { outcome: "live", at: 9_500, why: null } })], (pid) => pid !== 3);

    expect(shown.unitName).toBe("unit-b");
  });

  test("with none under way, is the one that ended last, a cut-off run ending at its last write", () => {
    const shown = shownReading([reading("unit-a", { ending: { outcome: "live", at: 5_000, why: null } }), reading("unit-b", {}, 6_000)], () => false);

    expect(shown.unitName).toBe("unit-b");
    expect(shownReading([], () => true)).toEqual({ unitName: null, record: null, writtenAt: null });
  });
});

describe("the deployment a tab is handed", () => {
  test("the administrator is handed the run and the hold as they stand, with every heavy step the run ended", () => {
    const view = deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, hold, "r1", true, () => true);

    expect(view).toEqual({
      release: "r1",
      detailed: true,
      hold,
      run: { unitName: "unit-a", phase: "running", startedAt: 1_000, endedAt: null, outcome: null, commit: record.commit, plan: record.plan, stages: record.stages, steps: record.steps, ahead: record.ahead, running: record.running }
    });
  });

  test("a run whose process went without ending is cut off at the record's last write", () => {
    expect(deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, null, "r1", true, () => false).run).toMatchObject({ phase: "cut", endedAt: 3_000 });
  });

  test("a member is handed only that a run is under way, and nothing of a run that ended or of the hold", () => {
    expect(deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, hold, "r1", false, () => true)).toEqual({
      release: "r1",
      detailed: false,
      hold: null,
      run: { unitName: null, phase: "running", startedAt: 1_000, endedAt: null, outcome: null, commit: null, plan: [], stages: [], steps: [], ahead: [], running: null }
    });
    expect(deployViewFor({ unitName: "unit-a", record: { ...record, ending: { outcome: "live", at: 4_000, why: null } }, writtenAt: 4_000 }, null, "r1", false).run).toBeNull();
  });
});

describe("the hold", () => {
  test("is bmo-job's, read as the TODO board reads it, and none where none stands", async () => {
    expect(await readDeployHoldRow()).toBeNull();

    holding = { actorName: "deploy", reason: "a job", until: 9_000 };

    expect(await readDeployHoldRow()).toEqual({ since: 0, until: 9, commits: [], breaks: null, waitingOn: ["a job"], waitingFor: null, passing: [] });
  });
});
