import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
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

const { deployRoots, deployViewFor, readDeployCarried, readDeployHoldRow, readDeployReading, readDeployReadings, shownReading } = await import("../../../apps/web/server/utils/deploy");

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

    expect(read).toMatchObject({ unitName: "unit-a", record, root });
    expect(read!.writtenAt).toBeGreaterThan(0);
    expect(none).toEqual({ unitName: "unit-b", record: null, writtenAt: null, root: join(scratch, "unit-b") });
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

describe("what a deploy carries", () => {
  test("is every commit since the deploy of another version, oldest first, with the release's version commit left off and the item a subject names", () => {
    const root = join(scratch, "unit-carried");
    const tree = join(root, "deploy-expand");
    const git = (...args: string[]): string => execFileSync("git", ["-C", tree, ...args], { encoding: "utf8" });

    mkdirSync(tree, { recursive: true });
    git("init", "-q");
    git("config", "user.email", "agent-a@example.invalid");
    git("config", "user.name", "agent-a");

    writeFileSync(join(tree, "VERSION"), "2.19.0\n");
    writeFileSync(join(tree, "work.txt"), "one\n");
    git("add", ".");
    git("commit", "-q", "-m", "chore(console): version 2.19.0");
    const before = git("rev-parse", "HEAD").trim();

    writeFileSync(join(tree, "work.txt"), "two\n");
    git("add", ".");
    git("commit", "-q", "-m", "fix(console): an item (#41)");
    const feature = git("rev-parse", "HEAD").trim();

    writeFileSync(join(tree, "VERSION"), "2.19.1\n");
    git("add", ".");
    git("commit", "-q", "-m", "chore(console): version 2.19.1");
    const bump = git("rev-parse", "HEAD").trim();

    writeFileSync(join(tree, "work.txt"), "three\n");
    git("add", ".");
    git("commit", "-q", "-m", "fix(console): another change");
    const final = git("rev-parse", "HEAD").trim();

    writeFileSync(join(root, "deployed.log"), [
      `2026-10-24T00:00:00.000Z ${before}  chore(console): version 2.19.0`,
      `2026-10-24T00:01:00.000Z ${bump}  chore(console): version 2.19.1`,
      `2026-10-24T00:02:00.000Z ${final}  fix(console): another change`,
      ""
    ].join("\n"));
    writeFileSync(join(root, "deployed.json"), JSON.stringify({ commit: final, subject: "fix(console): another change", version: "2.19.1", at: "2026-10-24T00:02:00.000Z" }));

    expect(readDeployCarried({ unitName: "unit-carried", record: null, writtenAt: null, root })).toEqual([
      { commit: feature, subject: "fix(console): an item (#41)", todoId: 41 },
      { commit: final, subject: "fix(console): another change", todoId: null }
    ]);
  });

  test("a deploy with no earlier line shows its own commit, so a deploy of one says one", () => {
    const root = join(scratch, "unit-first");
    const tree = join(root, "deploy-expand");
    const git = (...args: string[]): string => execFileSync("git", ["-C", tree, ...args], { encoding: "utf8" });

    mkdirSync(tree, { recursive: true });
    git("init", "-q");
    git("config", "user.email", "agent-a@example.invalid");
    git("config", "user.name", "agent-a");
    writeFileSync(join(tree, "VERSION"), "1.0.0\n");
    git("add", ".");
    git("commit", "-q", "-m", "feat(console): the first change");
    const only = git("rev-parse", "HEAD").trim();

    writeFileSync(join(root, "deployed.json"), JSON.stringify({ commit: only, subject: "feat(console): the first change", version: "1.0.0" }));

    expect(readDeployCarried({ unitName: "unit-first", record: null, writtenAt: null, root })).toEqual([
      { commit: only, subject: "feat(console): the first change", todoId: null }
    ]);
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
    expect(shownReading([], () => true)).toEqual({ unitName: null, record: null, writtenAt: null, root: null });
  });
});

describe("the deployment a tab is handed", () => {
  test("the administrator is handed the run and the hold as they stand, with every heavy step the run ended", () => {
    const view = deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, hold, "r1", true, () => true);

    expect(view).toEqual({
      release: "r1",
      detailed: true,
      hold,
      run: { unitName: "unit-a", phase: "running", startedAt: 1_000, endedAt: null, outcome: null, commit: record.commit, carried: [], plan: record.plan, stages: record.stages, steps: record.steps, ahead: record.ahead, running: record.running }
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
      run: { unitName: null, phase: "running", startedAt: 1_000, endedAt: null, outcome: null, commit: null, carried: [], plan: [], stages: [], steps: [], ahead: [], running: null }
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
