import { STATUS_HISTORY_LIMIT, WORKER_AGENT } from "#shared/config";

import { agency, agencyCall, agencyRoute } from "./agency";
import { job as jobService, jobCall } from "./job";
import { planOf } from "../../app/domain/tool-view";

import type { Job as AgencyJob } from "@agency/client";
import type { ItemRuns, JobLine, JobPrompt, JobRecord, LiveRun, RanOn } from "#shared/types";

// A worker's job and the jobs that have just run, as the agency's fixed API reads them (the agency's `docs/api.md`,
// 「assignments and jobs」), into the shapes the worker's screen and the live board draw. The agency's times are
// milliseconds and the console's seconds.

const seconds = (ms: number): number => Math.floor(ms / 1000);

// How many jobs under way the board reads. More than any machine runs at once, and the agency's largest page.
const LIVE_JOBS_LIMIT = 500;

// The jobs a screen of the agency's names keeps its line for, newest first: a repository's, the jobs run in it, and
// otherwise a role's, the jobs run as it (the agency's `docs/api.md`, 「assignments and jobs」).
async function jobsOf(name: string): Promise<AgencyJob[]> {
  const inRepository = await agencyCall(agency().GET("/jobs", { params: { query: { repositoryName: name, limit: 50 } } }));

  if (inRepository.items.length > 0) return inRepository.items;

  // The published client names no `roleName` filter, which the agency's document states; it is asked as written there,
  // and the answer is held to the role all the same.
  const asked = await agencyRoute<{ items: AgencyJob[] }>("GET", `/jobs?roleName=${encodeURIComponent(name)}&limit=50`);

  return asked.items.filter((job) => job.roleName === name);
}

// The job a line speaks of: the run named where it is one of these jobs, otherwise the one going, otherwise the latest.
function jobChosen(jobs: readonly AgencyJob[], run: string | null): AgencyJob | null {
  const named = run === null || run.trim() === "" ? undefined : jobs.find((job) => job.runName === run.trim() || String(job.runId ?? job.id) === run.trim());
  const live = jobs.find((job) => job.state === "running" || job.state === "starting");

  return named ?? live ?? [...jobs].sort((one, other) => other.startedAt - one.startedAt)[0] ?? null;
}

/** The job a repository's or a role's screen keeps a line for, or null where it has none. */
export async function readWorkerJob(worker: string, run: string | null): Promise<JobLine | null> {
  const job = jobChosen(await jobsOf(worker), run);

  return job === null ? null : {
    run: job.runName ?? String(job.runId ?? job.id),
    agent: job.workerName ?? job.roleName ?? worker,
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
  return jobChosen(await jobsOf(worker), run);
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
      // A job's lines stand under the worker it ran on, the agent of its session; the role names none.
      worker: job.workerName ?? job.roleName,
      repository: job.repositoryName ?? null,
      checkout: job.workerName ?? null
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
      jobService().GET("/items/{itemId}", { params: { path: { itemId: job.itemId } } })
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
    // A job's lines stand under the worker it runs on, the agent of its session, so its line leads to that
    // worker's log; a job on the role's own checkout stands under the role's name.
    agent: job.workerName ?? job.roleName,
    repository: job.repositoryName ?? null,
    checkout: job.workerName ?? null,
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
  // A job that moved from starting to running between the two reads is listed by both, and stands once; and each is
  // held to its own state, so a list answering more than its filter asked for hands on no job that has ended.
  const jobs = [...new Map([...starting.items, ...running.items].filter((job) => job.state === "starting" || job.state === "running").map((job) => [job.id, job])).values()];
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
 * answered on and the newest plan it laid out of its own (docs/web.md, 「The work view」). A job's lines stand under the
 * worker it ran on.
 */
export async function itemRunsOf(worker: string | null, todoId: number): Promise<ItemRuns> {
  // The item's own jobs, asked by its number, on its worker where it names one; each is held to the item as well.
  const query = worker === null ? { itemId: todoId, limit: 50 } : { itemId: todoId, repositoryName: worker, limit: 50 };
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

  const lines = (await agencyCall(agency().GET("/log-lines", { params: { query: { runId: latest.runId, agentName: latest.workerName ?? latest.roleName, after: 0, limit: RUN_LINES } } }))).items;

  for (const line of [...lines].reverse()) {
    if (runs.ranOn === null && line.kind === "answer") runs.ranOn = roadOf(line.text);
    if (runs.plan.length === 0 && line.kind === "tool") runs.plan = planOf(line.text) ?? [];
  }

  return runs;
}
