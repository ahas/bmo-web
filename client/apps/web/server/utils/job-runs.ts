import { STATUS_HISTORY_LIMIT, WORKER_AGENT } from "#shared/config";
import { jobRunName } from "#shared/run-name";

import { agency, agencyCall, agencyRoute, isJobUnderWay } from "./agency";
import { requireReadableAgent } from "./agent-reach";
import { job as jobService, jobCall } from "./job";
import { jobFigures } from "./run-tally";
import { planOf } from "../../app/domain/tool-view";

import type { Job as AgencyJob } from "@agency/client";
import type { H3Event } from "h3";
import type { ItemRuns, JobLine, JobPrompt, JobRecord, LiveRun, RanOn } from "#shared/types";
import type { RunFigures } from "./run-tally";

// A worker's job and the jobs that have just run, as the agency's fixed API reads them (the agency's `docs/api.md`,
// 「assignments and jobs」), into the shapes the worker's screen and the home screen draw. The agency's times are
// milliseconds and the console's seconds.

const seconds = (ms: number): number => Math.floor(ms / 1000);

// How many jobs under way the board reads. More than any machine runs at once, and the agency's largest page.
const LIVE_JOBS_LIMIT = 500;

// The jobs a screen of the agency's names keeps its line for: a repository's, the jobs run in it, and where the
// name is a checkout of one, that checkout's jobs; otherwise a role's, the jobs run as it (the agency's
// `docs/api.md`, 「assignments and jobs」 — it filters by repository, role, item, room and holder, and a checkout
// is none of those, so its repository is asked for and its own jobs kept).
async function jobsOf(name: string): Promise<AgencyJob[]> {
  const inRepository = await agencyCall(agency().GET("/jobs", { params: { query: { repositoryName: name, limit: 50 } } }));

  if (inRepository.items.length > 0) return inRepository.items;

  const base = await repositoryOf(name);

  if (base !== null && base !== name) {
    const inBase = await agencyCall(agency().GET("/jobs", { params: { query: { repositoryName: base, limit: 50 } } }));
    const ofCheckout = inBase.items.filter((job) => job.workerName === name);

    if (ofCheckout.length > 0) return ofCheckout;
  }

  // The published client names no `roleName` filter, which the agency's document states; it is asked as written there,
  // and the answer is held to the role all the same.
  const asked = await agencyRoute<{ items: AgencyJob[] }>("GET", `/jobs?roleName=${encodeURIComponent(name)}&limit=50`);

  return asked.items.filter((job) => job.roleName === name);
}

// The repository a checkout's name belongs to, as the agency's list of repositories says; null where the name is
// no checkout of one it holds.
async function repositoryOf(checkout: string): Promise<string | null> {
  const page = await agencyCall(agency().GET("/repositories")).catch(() => null);

  return page?.items.find((repository) => repository.checkouts?.some((one) => one.name === checkout))?.name ?? null;
}

// The job a line speaks of: the run named where it is one of these jobs, otherwise the one going — starting, running
// or under its orderer's review — otherwise the latest.
function jobChosen(jobs: readonly AgencyJob[], run: string | null): AgencyJob | null {
  // A link names a run by its name, which for a job is its number's name even before its row has been given one, or
  // by the bare number of a row of the ledger it was drawn from.
  const asked = run?.trim() ?? "";
  const named = asked === "" ? undefined : jobs.find((job) => jobRunName(job) === asked || String(job.runId ?? job.id) === asked);
  const live = jobs.find((job) => isJobUnderWay(job.state));

  return named ?? live ?? [...jobs].sort((one, other) => other.startedAt - one.startedAt)[0] ?? null;
}

/** The job a screen keeps its line for: the job its link names, or the one the worker's or role's own jobs speak
 * of, or null where it has none. */
export async function readWorkerJob(worker: string, run: string | null): Promise<JobLine | null> {
  const job = jobChosen(await jobsOf(worker), run);

  return job === null ? null : await jobLineOf(job, job.agentName ?? job.workerName ?? job.roleName ?? worker);
}

/** The job of one number, read as the signed-in person reads it: a job the agency holds back from them answers as one
 * that does not stand, and the agent its lines stand under is then judged as every agent is, so a screen reaches its
 * job through its number whatever name stands in its address (docs/web.md, 「Access」). */
export async function readableJob(event: H3Event, jobId: number): Promise<AgencyJob | null> {
  let job: AgencyJob | null;

  try {
    job = await agencyCall(agency(event).GET("/jobs/{jobId}", { params: { path: { jobId } } }));
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;

    throw error;
  }

  await requireReadableAgent(event, job.agentName ?? job.workerName ?? job.roleName ?? "");

  return job;
}

/** The line of a job the reader has already been held to. */
export async function readJobLine(job: AgencyJob): Promise<JobLine> {
  return jobLineOf(job, job.agentName ?? job.workerName ?? job.roleName ?? "");
}

// One job as its line reads it, under the agent its log lines stand under: when it started and ended as its record
// holds them, and its tool calls and tokens as its run counts them.
async function jobLineOf(job: AgencyJob, agent: string): Promise<JobLine> {
  const figures: RunFigures = await jobFigures(job.id);

  return {
    job: job.id,
    run: jobRunName(job),
    agent,
    todoId: job.itemId,
    title: null,
    purpose: null,
    startedAt: seconds(job.startedAt),
    finishedAt: job.endedAt === null ? null : seconds(job.endedAt),
    tools: figures.calls,
    models: [],
    // The agency's own figure once the turn has ended; what the run has reported so far while it runs.
    spent: job.endedAt === null ? figures.spent : (job.usage ?? null)
  };
}

/** The prompt of the job that line speaks of, or null where the worker has none. */
export async function readWorkerJobPrompt(worker: string, run: string | null): Promise<JobPrompt | null> {
  const job = await jobNamed(worker, run);

  return job === null ? null : readJobPrompt(job);
}

/** The prompt of a job the reader has already been held to, or null where it left none. */
export async function readJobPrompt(job: AgencyJob): Promise<JobPrompt | null> {
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

/** The jobs that have just run, newest first, as many as are read of a kind. */
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
      // A job's lines stand under the agent its item named, the one that did the work (the agency's
      // docs/run-records.md, 「Agent log」); a job that named none stands under the checkout it ran in.
      worker: job.agentName ?? job.workerName ?? job.roleName,
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

// One job under way, as the home screen and an agent's screen read it: a worker's run, named by the run its
// log stands under, of the item it is a run of, in the room it reports to. The agency says no model while the
// job runs, and none of its ceiling, depth or launcher; the job's item is what a stop from the board names.
function liveRunOf(job: AgencyJob, room: number | null): LiveRun {
  return {
    id: job.id,
    kind: "worker",
    // A job's lines stand under the agent its item named, so its line leads to that agent's log; a job that
    // named none stands under the checkout it runs in, else the role's name.
    agent: job.agentName ?? job.workerName ?? job.roleName,
    repository: job.repositoryName ?? null,
    checkout: job.workerName ?? null,
    chatId: room,
    messageId: null,
    startedAt: seconds(job.startedAt),
    unit: jobRunName(job),
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
 * The jobs running beside the chat, as the agency's `running` filter lists them: starting, running, or reviewing while
 * the job's report awaits its orderer's move, which still holds its agent's seat and so is still going.
 */
export async function readLiveRuns(): Promise<LiveRun[]> {
  const listed = await agencyCall(agency().GET("/jobs", { params: { query: { running: true, limit: LIVE_JOBS_LIMIT } } }));
  // Each job is held to its own state, so a list answering more than its filter asked for hands on no job that has ended.
  const jobs = listed.items.filter((job) => isJobUnderWay(job.state));
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
 * The jobs of an item on its worker, read from the agency: how many ran it and for how long, and of its latest — the
 * item's own job that started last — its line, the road it answered on and the newest plan it laid out of its own
 * (docs/web.md, the TODO modal's state tab). A job's lines stand under the worker it ran on.
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
    plan: [],
    latest: null
  };

  if (latest === undefined) return runs;

  const agent = latest.agentName ?? latest.workerName ?? latest.roleName;
  const [jobLine, read] = await Promise.all([
    jobLineOf(latest, agent),
    agencyCall(agency().GET("/log-lines", { params: { query: { jobId: latest.id, after: 0, limit: RUN_LINES } } }))
  ]);
  const lines = read.items;

  runs.latest = jobLine;

  for (const line of [...lines].reverse()) {
    if (runs.ranOn === null && line.kind === "answer") runs.ranOn = roadOf(line.text);
    if (runs.plan.length === 0 && line.kind === "tool") runs.plan = planOf(line.text) ?? [];
  }

  return runs;
}
