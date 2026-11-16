// The testbed's progress record (the testbed's `docs/deploy.md`, 「What a deployment says of itself as it runs」):
// where a deployment stands while it runs, written into one file a reader needs only the file and the run's
// process for, so a service restarting under a deployment leaves the reading as it was. The record is the
// testbed's; this is its shape as the deployment mark reads it, and the reading of its text.

/** The stages a run can pass, in the order it passes them; a rollback is never planned. */
export const DEPLOY_STAGES = ["check", "backup", "tree", "build", "before", "restart", "stay-up", "after", "rollback"] as const;

export type DeployStage = (typeof DEPLOY_STAGES)[number];

/** The parts of a stage written as steps of their own: the backup's snapshot, its pack and its check. */
export const DEPLOY_PARTS = ["snapshot", "pack", "check"] as const;

export type DeployPart = (typeof DEPLOY_PARTS)[number];

/**
 * How a run ended, as the testbed writes it: live, put back, failed, or stopped where nothing went live by its own
 * judgement — a gate that did not pass, or a refusal, which `refused` tells apart.
 */
export type DeployEnding = "live" | "rolled-back" | "failed" | "stopped";

/** A step written before it runs, as one of its stage's steps still to come. */
export interface DeployStepAhead {
  name: string;
  /** Which part of its stage it is, where it is one. */
  part?: DeployPart;
}

/** The heavy step under way, written as it begins. */
export interface DeployStepUnderWay extends DeployStepAhead {
  /** The stage under way when it began. */
  stage?: DeployStage;
  /** When it began, in milliseconds. */
  at: number;
}

/** One heavy step of a run — a check, the suite, a build — with its wait for its turn and its run. */
export interface DeployStep {
  name: string;
  waitedSeconds: number;
  ranSeconds: number;
  /** Its exit code. */
  code: number;
  /** When it ended, in milliseconds. */
  at: number;
  /** The stage under way when it ended. */
  stage?: DeployStage;
  /** Which part of its stage it is, where it is one. */
  part?: DeployPart;
}

export interface DeployProgress {
  /** The deploy unit the run stands in, whose journal is its log; null where it stands in none. */
  unit: string | null;
  /** The process of the run that began the record. */
  pid: number;
  /** The commit going live, once it is known. */
  commit: string | null;
  /** When the run began, in milliseconds. */
  startedAt: number;
  /** Every stage the run means to pass, in order; empty where it named none. */
  plan: DeployStage[];
  /** Every stage passed so far with when it began, the last one under way until the run ends. */
  stages: { stage: DeployStage; at: number }[];
  /** Every heavy step ended so far, in the order they ended. */
  steps: DeployStep[];
  /** The steps of the stage under way still to come, in order. */
  ahead: DeployStepAhead[];
  /** The heavy step under way; null between steps. */
  running: DeployStepUnderWay | null;
  /** Whether the commit that was live before was put back. */
  rolledBack: boolean;
  /** Whether it ended on a refusal, before it stood in the deployment line and before anything changed. */
  refused: boolean;
  /** How it ended, null while it runs. */
  ending: { outcome: DeployEnding; at: number; why: string | null } | null;
}

const ENDINGS: readonly string[] = ["live", "rolled-back", "failed", "stopped"];

function isStage(value: unknown): value is DeployStage {
  return typeof value === "string" && (DEPLOY_STAGES as readonly string[]).includes(value);
}

function isPart(value: unknown): value is DeployPart {
  return typeof value === "string" && (DEPLOY_PARTS as readonly string[]).includes(value);
}

function isStep(value: unknown): value is DeployStep {
  const one = value as Partial<DeployStep> | null;

  return typeof one === "object" && one !== null && typeof one.name === "string" && typeof one.waitedSeconds === "number" && typeof one.ranSeconds === "number" && typeof one.code === "number" && typeof one.at === "number";
}

// A step as the record keeps it: a stage or a part this reading does not know is left off rather than the step.
function readStep(step: DeployStep): DeployStep {
  const { stage, part, ...rest } = step;

  return { ...rest, ...(isStage(stage) ? { stage } : {}), ...(isPart(part) ? { part } : {}) };
}

function readAhead(value: unknown): DeployStepAhead | null {
  const one = value as Partial<DeployStepAhead> | null;

  if (typeof one !== "object" || one === null || typeof one.name !== "string") return null;

  return { name: one.name, ...(isPart(one.part) ? { part: one.part } : {}) };
}

function readUnderWay(value: unknown): DeployStepUnderWay | null {
  const ahead = readAhead(value);
  const one = value as Partial<DeployStepUnderWay>;

  if (ahead === null || typeof one.at !== "number") return null;

  return { ...ahead, ...(isStage(one.stage) ? { stage: one.stage } : {}), at: one.at };
}

/** The record out of its file's text; null where there is none or it does not read as one. */
export function readDeployProgress(text: string | null): DeployProgress | null {
  if (text === null || text.trim() === "") return null;

  let said: Partial<DeployProgress>;

  try {
    said = JSON.parse(text) as Partial<DeployProgress>;
  } catch {
    return null;
  }

  if (typeof said !== "object" || said === null) return null;
  if (typeof said.pid !== "number" || typeof said.startedAt !== "number" || !Array.isArray(said.stages)) return null;

  const ending = said.ending;

  return {
    unit: typeof said.unit === "string" ? said.unit : null,
    pid: said.pid,
    commit: typeof said.commit === "string" ? said.commit : null,
    startedAt: said.startedAt,
    plan: Array.isArray(said.plan) ? said.plan.filter(isStage) : [],
    stages: said.stages.filter((one) => isStage(one?.stage) && typeof one.at === "number"),
    steps: Array.isArray(said.steps) ? said.steps.filter(isStep).map(readStep) : [],
    ahead: Array.isArray(said.ahead) ? said.ahead.flatMap((one) => readAhead(one) ?? []) : [],
    running: readUnderWay(said.running),
    rolledBack: said.rolledBack === true,
    refused: said.refused === true,
    ending:
      ending !== null && typeof ending === "object" && ENDINGS.includes(ending.outcome) && typeof ending.at === "number"
        ? { outcome: ending.outcome, at: ending.at, why: typeof ending.why === "string" ? ending.why : null }
        : null
  };
}

/** Where a record stands for a reader: running, ended, or cut off — unended with its process gone. */
export function deployPhase(record: DeployProgress, alive: (pid: number) => boolean): "running" | "ended" | "cut" {
  if (record.ending !== null) return "ended";

  return alive(record.pid) ? "running" : "cut";
}
