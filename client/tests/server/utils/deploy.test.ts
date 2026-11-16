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

const { deployRoots, deployViewFor, readDeployCommits, readDeployHoldRow, readDeployReading, readDeployReadings, readWaitingBrings, runningDeployRuns, shownReading } = await import("../../../apps/web/server/utils/deploy");
const { deployLineOf, readDeployLine } = await import("../../../apps/web/server/utils/deploy-line");

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
  refused: false,
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

    // The popover lists the release whole; a TODO row is carried only by what this deploy brought past the one before.
    expect(readDeployCommits({ unitName: "unit-carried", record: null, writtenAt: null, root })).toEqual({
      carried: [
        { commit: feature, subject: "fix(console): an item (#41)", todoId: 41 },
        { commit: final, subject: "fix(console): another change", todoId: null }
      ],
      brings: [{ commit: final, subject: "fix(console): another change", todoId: null }]
    });
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

    const one = [{ commit: only, subject: "feat(console): the first change", todoId: null }];

    expect(readDeployCommits({ unitName: "unit-first", record: null, writtenAt: null, root })).toEqual({ carried: one, brings: one });
  });

  // A run writes its own line only once it is live, so the deploy before it is the last line written before it began:
  // a run of the commit already live brings nothing again, and a run of a later commit brings only what is new.
  test("a run under way brings what is new since the last deploy before it began, nothing where its commit is live", () => {
    const root = join(scratch, "unit-again");
    const tree = join(root, "deploy-expand");
    const git = (...args: string[]): string => execFileSync("git", ["-C", tree, ...args], { encoding: "utf8" });
    const commit = (subject: string): string => {
      writeFileSync(join(tree, "work.txt"), `${subject}\n`);
      git("add", ".");
      git("commit", "-q", "-m", subject);

      return git("rev-parse", "HEAD").trim();
    };

    mkdirSync(tree, { recursive: true });
    git("init", "-q");
    git("config", "user.email", "agent-a@example.invalid");
    git("config", "user.name", "agent-a");

    const older = commit("fix(console): an older release (#60)");
    commit("fix(console): live before (#61)");
    const live = commit("fix(console): live now (#62)");
    const next = commit("fix(console): the next change (#63)");

    writeFileSync(join(root, "deployed.json"), JSON.stringify({ commit: live, subject: "fix(console): live now (#62)", version: null }));
    writeFileSync(join(root, "deployed.log"), [
      `2026-10-24T00:00:00.000Z ${older}  fix(console): an older release (#60)`,
      `2026-10-24T00:01:00.000Z ${live}  fix(console): live now (#62)`,
      ""
    ].join("\n"));

    const running = (at: string, commit: string) => ({ unitName: "unit-again", record: { ...record, commit, startedAt: Date.parse(at), ending: null }, writtenAt: null, root });

    expect(readDeployCommits(running("2026-10-24T00:05:00.000Z", live)).brings).toEqual([]);
    expect(readDeployCommits(running("2026-10-24T00:05:00.000Z", next)).brings).toEqual([{ commit: next, subject: "fix(console): the next change (#63)", todoId: 63 }]);
  });

  test("a deployment waiting in the line would bring the commits from the release live to its own, none it cannot read", () => {
    const root = join(scratch, "unit-waiting");
    const tree = join(root, "deploy-expand");
    const git = (...args: string[]): string => execFileSync("git", ["-C", tree, ...args], { encoding: "utf8" });
    const commit = (subject: string): string => {
      writeFileSync(join(tree, "work.txt"), `${subject}\n`);
      git("add", ".");
      git("commit", "-q", "-m", subject);

      return git("rev-parse", "HEAD").trim();
    };

    mkdirSync(tree, { recursive: true });
    git("init", "-q");
    git("config", "user.email", "agent-a@example.invalid");
    git("config", "user.name", "agent-a");

    const live = commit("fix(console): live already (#50)");
    const item = commit("fix(console): an item (#51)");
    const asked = commit("fix(console): the commit asked for");

    writeFileSync(join(root, "deployed.json"), JSON.stringify({ commit: live, subject: "fix(console): live already (#50)", version: null }));
    writeFileSync(join(root, "deployed.log"), `2026-10-24T00:00:00.000Z ${live}  fix(console): live already (#50)\n`);

    expect(readWaitingBrings(root, asked.slice(0, 10))).toEqual([
      { commit: item, subject: "fix(console): an item (#51)", todoId: 51 },
      { commit: asked, subject: "fix(console): the commit asked for", todoId: null }
    ]);
    expect(readWaitingBrings(root, live)).toEqual([]);
    expect(readWaitingBrings(root, "f".repeat(40))).toEqual([]);
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

  // Several units deploy at once, and a row's chip reads every one under way, not only the one the bar stands.
  test("every run under way is read, each by its unit, and an ended one is left out", () => {
    const runs = runningDeployRuns([reading("unit-a", { pid: 1 }), reading("unit-b", { pid: 2 }), reading("unit-c", { pid: 3, ending: { outcome: "live", at: 9_500, why: null } })], () => true);

    expect(runs.map((one) => one.unitName)).toEqual(["unit-a", "unit-b"]);
    expect(runs.every((one) => one.phase === "running")).toBe(true);
  });
});

describe("the deployment a tab is handed", () => {
  test("the administrator is handed the run and the hold as they stand, with every heavy step the run ended", () => {
    const detail = { hold, commits: { carried: [], brings: [] }, runs: [], line: [] };
    const view = deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, "r1", detail, () => true);

    expect(view).toEqual({
      release: "r1",
      detailed: true,
      hold,
      run: { unitName: "unit-a", phase: "running", startedAt: 1_000, endedAt: null, end: null, commit: record.commit, carried: [], brings: [], plan: record.plan, stages: record.stages, steps: record.steps, ahead: record.ahead, running: record.running },
      runs: [],
      line: []
    });
  });

  test("a run whose process went without ending is cut off at the record's last write", () => {
    const detail = { hold: null, commits: { carried: [], brings: [] }, runs: [], line: [] };

    expect(deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, "r1", detail, () => false, () => false).run).toMatchObject({ phase: "cut", endedAt: 3_000 });
  });

  // The testbed writes a gate that did not pass and a refusal alike as stopped (its docs/deploy.md, 「What a
  // deployment says of itself as it runs」); a run cut off is withdrawn only where its unit was stopped on request.
  test("a run stopped at its gate failed, a refused one never began, and a cut one was withdrawn only where its unit was asked to stop", () => {
    const detail = { hold: null, commits: { carried: [], brings: [] }, runs: [], line: [] };
    const ended = (over: Partial<DeployProgress>, alive = false, asked = false) => deployViewFor({ unitName: "unit-a", record: { ...record, ...over }, writtenAt: 3_000 }, "r1", detail, () => alive, (unit) => asked && unit === record.unit).run?.end;
    const stopped = { outcome: "stopped" as const, at: 4_000, why: "the gate did not pass" };

    expect(ended({ ending: stopped })).toBe("failed");
    expect(ended({ ending: stopped, refused: true })).toBe("refused");
    expect(ended({ ending: { ...stopped, outcome: "failed" } })).toBe("failed");
    expect(ended({ ending: { ...stopped, outcome: "rolled-back" } })).toBe("rolled-back");
    expect(ended({ ending: { ...stopped, outcome: "live" } })).toBe("live");
    expect(ended({}, false, true)).toBe("withdrawn");
    expect(ended({}, false, false)).toBe("failed");
    expect(ended({ unit: null }, false, true)).toBe("failed");
    expect(ended({}, true, true)).toBeNull();
  });

  test("a member is handed nothing of a run, under way or ended, nor of the hold or the line", () => {
    expect(deployViewFor({ unitName: "unit-a", record, writtenAt: 3_000 }, "r1", null, () => true)).toEqual({
      release: "r1",
      detailed: false,
      hold: null,
      run: null
    });
    expect(deployViewFor({ unitName: "unit-a", record: { ...record, ending: { outcome: "live", at: 4_000, why: null } }, writtenAt: 4_000 }, "r1", null).run).toBeNull();
  });
});

describe("the hold", () => {
  test("is bmo-job's, read as the TODO board reads it, and none where none stands", async () => {
    expect(await readDeployHoldRow()).toBeNull();

    holding = { actorName: "deploy", reason: "a job", until: 9_000 };

    expect(await readDeployHoldRow()).toEqual({ since: 0, until: 9, commits: [], breaks: null, waitingOn: ["a job"], waitingFor: null, passing: [] });
  });
});

// The deployments waiting their turn in the testbed's deployment line, read from the deploy units standing
// (docs/web.md, 「Deployment in the title bar」; docs/boundary.md, 「Gaps the console meets」).
describe("the line", () => {
  const root = (name: string): string => join(scratch, "line", name);
  const readings = [
    { unitName: "unit-a", record: { ...record, unit: "deploy-a-1" }, writtenAt: 1, root: root("unit-a") },
    { unitName: "unit-b", record: null, writtenAt: null, root: root("unit-b") }
  ];
  const unit = (name: string, progressFile: string | null, since: number, commit: string | null = "a".repeat(12)) => ({ unit: `${name}.service`, since, progressFile, commit });

  test("is every unit standing whose record lies under a listed root and is not its own run, the one begun first first", () => {
    const brings = (where: string, commit: string) => [{ commit, subject: where, todoId: null }];
    const line = deployLineOf([
      unit("deploy-b-2", join(root("unit-b"), "deploy-progress.json"), 3_000),
      unit("deploy-a-1", join(root("unit-a"), "deploy-progress.json"), 1_000),
      unit("deploy-a-3", join(root("unit-a"), "deploy-progress.json"), 2_000, null),
      unit("deploy-x-4", join(scratch, "elsewhere", "deploy-progress.json"), 500),
      unit("deploy-y-5", null, 400)
    ], readings, brings);

    expect(line).toEqual([
      { unitName: "unit-a", unit: "deploy-a-3.service", commit: null, since: 2_000, brings: [] },
      { unitName: "unit-b", unit: "deploy-b-2.service", commit: "a".repeat(12), since: 3_000, brings: [{ commit: "a".repeat(12), subject: root("unit-b"), todoId: null }] }
    ]);
  });

  test("reads each unit's record from its process's environment and its commit from its command", async () => {
    const asked: string[][] = [];
    const run = async (command: readonly string[]): Promise<string | null> => {
      asked.push([...command]);

      if (command.includes("list-units")) return JSON.stringify([{ unit: "deploy-b-2.service" }, { unit: "deploy-gone.service" }]);
      if (command.includes("MainPID")) return command.at(-1) === "deploy-b-2.service" ? "77\n" : "0\n";
      if (command.includes("ActiveEnterTimestamp")) return "@1794829458\n";

      return null;
    };
    const words = {
      environment: (pid: number) => (pid === 77 ? ["PATH=/bin", `BMO_DEPLOY_PROGRESS=${join(root("unit-b"), "deploy-progress.json")}`] : null),
      argv: (pid: number) => (pid === 77 ? ["/bin/deployer", "deploy", "--commit", "b".repeat(10), "--message=Carries #51."] : null)
    };
    const line = await readDeployLine(readings, run, words);

    expect(line.map(({ unitName, unit: named, commit, since }) => ({ unitName, unit: named, commit, since }))).toEqual([
      { unitName: "unit-b", unit: "deploy-b-2.service", commit: "b".repeat(10), since: 1_794_829_458_000 }
    ]);
    expect(asked[0]).toContain("bmo-deploy-*");
    expect(await readDeployLine(readings, async () => null, words)).toEqual([]);
  });
});
