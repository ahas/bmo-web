import { STATUS_HISTORY_LIMIT, WORKER_AGENT } from "#shared/config";

import { agency, agencyCall } from "./agency";
import { job as jobService, jobCall, JOB_TIMEOUT_MS } from "./job";
import { within } from "./unit-answer";
import { planOf } from "../../app/domain/tool-view";

import type { Job as AgencyJob } from "@agency/client";
import type { ItemRuns, JobLine, JobPrompt, JobRecord, LiveRun, RanOn } from "#shared/types";

// A worker's job and the jobs that have just run, as the agency's fixed API reads them (the agency's `docs/api.md`,
// 「assignments and jobs」), into the shapes the worker's screen and the live board draw. The agency's times are
// milliseconds and the console's seconds.

const seconds = (ms: number): number => Math.floor(ms / 1000);

// How many jobs under way the board reads. More than any machine runs at once, and the agency's largest page.
const LIVE_JOBS_LIMIT = 500;

/** The job a worker's screen keeps a line for, or null where the worker has none. */
export async function readWorkerJob(worker: string, run: string | null): Promise<JobLine | null> {
  const jobs = await agencyCall(agency().GET("/jobs", { params: { query: { workerName: worker, limit: 50 } } }));
  const named = run === null || run.trim() === "" ? undefined : jobs.items.find((job) => job.runName === run.trim() || String(job.runId ?? job.id) === run.trim());
  const live = jobs.items.find((job) => job.state === "running" || job.state === "starting");
  const job = named ?? live ?? [...jobs.items].sort((one, other) => other.startedAt - one.startedAt)[0];

  return job === undefined ? null : {
    run: job.runName ?? String(job.runId ?? job.id),
    todoId: job.itemId,
    title: null,
    purpose: null,
    startedAt: seconds(job.startedAt),
    finishedAt: job.endedAt === null ? null : seconds(job.endedAt),
    tools: 0,
    models: []
  };
}

/** The prompt of the job that line speaks of, or null where the worker has none. */
export async function readWorkerJobPrompt(worker: string, run: string | null): Promise<JobPrompt | null> {
  const job = await jobNamed(worker, run);

  if (job === null) return null;

  try {
    const prompt = await agencyCall(agency().GET("/jobs/{jobId}/prompt", { params: { path: { jobId: job.id } } }));

    return { text: prompt.text, english: prompt.english ?? null };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

async function jobNamed(worker: string, run: string | null): Promise<AgencyJob | null> {
  const jobs = await agencyCall(agency().GET("/jobs", { params: { query: { workerName: worker, limit: 50 } } }));
  const named = run === null || run.trim() === "" ? undefined : jobs.items.find((job) => job.runName === run.trim() || String(job.runId ?? job.id) === run.trim());
  const live = jobs.items.find((job) => job.state === "running" || job.state === "starting");
  const job = named ?? live ?? [...jobs.items].sort((one, other) => other.startedAt - one.startedAt)[0];

  return job ?? null;
}

/** The jobs that have just run, newest first, as many as the live board shows of a kind. */
export async function readRecentJobs(): Promise<JobRecord[]> {
  const [ended, stopped] = await Promise.all([
    agencyCall(agency().GET("/jobs", { params: { query: { state: "ended", limit: STATUS_HISTORY_LIMIT } } })),
    agencyCall(agency().GET("/jobs", { params: { query: { state: "stopped", limit: STATUS_HISTORY_LIMIT } } }))
  ]);
  const jobs = new Map([...ended.items, ...stopped.items].map((job) => [job.id, job]));

  return [...jobs.values()]
    .sort((one, other) => other.startedAt - one.startedAt)
    .map((job) => ({
      id: job.id,
      unit: "",
      chatId: 0,
      model: null,
      launchedAt: seconds(job.startedAt),
      finishedAt: job.endedAt === null ? null : seconds(job.endedAt),
      outcome: job.outcome,
      ok: job.outcome === "ok" ? true : job.outcome === null ? null : false,
      todoId: job.itemId,
      attempt: 1,
      purpose: job.report,
      worker: job.workerName
    }));
}

// The room a job ran for. The agency's answer carries it beside the job, though its published client does not
// name the field yet, so it is read from the answer as it stands. A launch that named no room is placed by the
// item it is a run of, whose scope is the room the item was filed for; an item of no room, or one the job service
// no longer holds, leaves the run in no room.
async function roomOf(job: AgencyJob): Promise<number | null> {
  const direct = (job as AgencyJob & { roomId?: number | null }).roomId;

  if (typeof direct === "number") return direct;
  if (job.itemId <= 0) return null;

  try {
    const item = await jobCall(
      jobService().GET("/items/{itemId}", { params: { path: { itemId: job.itemId } }, signal: within(JOB_TIMEOUT_MS) })
    );
    const scope = item.scope?.trim() ?? "";

    return /^-?\d+$/.test(scope) ? Number(scope) : null;
  } catch {
    return null;
  }
}

// One job under way, as the live board and a room's working line read it: a worker's run, named by the run its
// log stands under, of the item it is a run of, in the room it reports to. The agency says no model while the
// job runs, and none of its ceiling, depth or launcher; the job's item is what a stop from the board names.
function liveRunOf(job: AgencyJob, room: number | null): LiveRun {
  return {
    id: job.id,
    kind: "worker",
    agent: job.workerName,
    chatId: room,
    messageId: null,
    startedAt: seconds(job.startedAt),
    unit: job.runName ?? String(job.runId ?? job.id),
    capSeconds: null,
    depth: null,
    model: null,
    startedBy: null,
    todoId: job.itemId > 0 ? job.itemId : null,
    purpose: null,
    progress: null,
    waiting: null,
    stop: job.itemId > 0 ? { kind: "item", id: String(job.itemId) } : null
  };
}

/**
 * The jobs running beside the chat, as the agency lists them. A job is `starting` while its worker is launched
 * and `running` while its turn goes, and the list narrows by one state at a time, so both are asked.
 */
export async function readLiveRuns(): Promise<LiveRun[]> {
  const [starting, running] = await Promise.all([
    agencyCall(agency().GET("/jobs", { params: { query: { state: "starting", limit: LIVE_JOBS_LIMIT } } })),
    agencyCall(agency().GET("/jobs", { params: { query: { state: "running", limit: LIVE_JOBS_LIMIT } } }))
  ]);
  // A job that moved from starting to running between the two reads is listed by both, and stands once.
  const jobs = [...new Map([...starting.items, ...running.items].map((job) => [job.id, job])).values()];
  const rooms = await Promise.all(jobs.map(roomOf));

  return jobs.map((job, at) => liveRunOf(job, rooms[at] ?? null));
}

// The most lines of a job's run read for its plan and its road: a plan is laid out early and rewritten as it goes, and
// a run longer than this has both in the lines read.
const RUN_LINES = 500;

// The road an answer line names: its record's `model`, a `[provider, model]` pair.
function roadOf(text: string): RanOn | null {
  try {
    const record = JSON.parse(text) as { model?: unknown };
    const pair: unknown = typeof record.model === "string" ? JSON.parse(record.model) : record.model;

    return Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string" ? { provider: pair[0], model: pair[1], changed: false } : null;
  } catch {
    return null;
  }
}

/**
 * The jobs of an item on its worker, read from the agency: how many ran it and for how long, the road its latest
 * answered on and the newest plan it laid out of its own (docs/web.md, 「The work view」). A job's lines stand under its
 * worker's name.
 */
export async function itemRunsOf(worker: string | null, todoId: number): Promise<ItemRuns> {
  // An item that names no worker runs on the base worker, so its jobs are found among the recent ones.
  const query = worker === null ? { limit: LIVE_JOBS_LIMIT } : { workerName: worker, limit: 50 };
  const jobs = (await agencyCall(agency().GET("/jobs", { params: { query } }))).items.filter((one) => one.itemId === todoId);
  const ended = jobs.filter((one) => one.endedAt !== null);
  const latest = [...jobs].sort((one, other) => other.startedAt - one.startedAt)[0];
  const runs: ItemRuns = {
    attempts: jobs.length,
    seconds: ended.length === 0 ? null : ended.reduce((sum, one) => sum + ((one.endedAt ?? one.startedAt) - one.startedAt) / 1000, 0),
    ranOn: null,
    plan: []
  };

  if (latest === undefined || latest.runId === null) return runs;

  const lines = (await agencyCall(agency().GET("/log-lines", { params: { query: { runId: latest.runId, agentName: latest.workerName, after: 0, limit: RUN_LINES } } }))).items;

  for (const line of [...lines].reverse()) {
    if (runs.ranOn === null && line.kind === "answer") runs.ranOn = roadOf(line.text);
    if (runs.plan.length === 0 && line.kind === "tool") runs.plan = planOf(line.text) ?? [];
  }

  return runs;
}
