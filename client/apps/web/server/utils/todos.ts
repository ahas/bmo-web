import { DONE_MAX, DONE_PAGE_SIZE, TODO_REPORTS_FRESH_MS, TODO_SEARCH_LIMIT, WORKER_AGENT } from "#shared/config";
import { filterRecords } from "bmo-ui/shared/search";
import { wording } from "#shared/wording";
import { NO_CONDITIONS, NO_ROOM, todoSearchFields } from "../../app/domain/todos";
import { agency, agencyCall, isJobUnderWay } from "./agency";
import { job, jobCall } from "./job";
import { namedLabel } from "./todo-assignment";

import type { Note, Item, Report, Queue } from "bmo-job-client";
import type { DeployHold, TodoBoard, TodoChoices, TodoItem, TodoNote, TodoReport, TodoReview, TodoStanding } from "#shared/types";
import type { TodoConditions } from "../../app/domain/todos";

// The TODO as bmo-job reads it in its fixed API (bmo-job's `docs/api.md`): the items it keeps, the queues they
// wait in, and each item's notes and reports, read into the rows the panel shows. The item carries its own title,
// brief, priority, state, assignee and approvals; what its job ran, what it spent and the long wait it marked are
// no part of an item and stand empty (docs/boundary.md, 「Gaps the console meets」).

// What a caller asked to find, or null for the ordinary list. Whitespace alone is not a search: it would match
// every row and read as the list having been filtered to itself.
export function searchedFor(value: unknown): string | null {
  const query = typeof value === "string" ? value.trim().slice(0, TODO_SEARCH_LIMIT) : "";

  return query === "" ? null : query;
}

// How many finished items to read. The panel asks for the whole run it has scrolled through rather than for the
// next page alone.
export function doneLimit(value: unknown): number {
  const asked = Number.parseInt(typeof value === "string" ? value : "", 10);

  return Number.isInteger(asked) && asked > 0 ? Math.min(asked, DONE_MAX) : DONE_PAGE_SIZE;
}

const seconds = (ms: number | null | undefined): number | null => (ms === null || ms === undefined ? null : Math.floor(ms / 1000));

// Every item, a page at a time, in the queue's order.
async function allItems(query: { q?: string } = {}): Promise<Item[]> {
  const found: Item[] = [];
  let after: number | undefined;

  for (;;) {
    const page = await jobCall(
      job().GET("/items", {
        params: { query: { limit: 500, ...(after === undefined ? {} : { after }), ...(query.q === undefined ? {} : { q: query.q }) } }
      })
    );

    found.push(...page.items);

    if (!page.more || page.items.length === 0) return found;

    after = page.items[page.items.length - 1]!.id;
  }
}

/** Every queue and how it stands, which is where the panel reads its pause and the deployment's hold. */
export async function readQueues(): Promise<Queue[]> {
  const found: Queue[] = [];
  let after: string | undefined;

  for (;;) {
    const page = await jobCall(
      job().GET("/queues", { params: { query: { limit: 500, ...(after === undefined ? {} : { after }) } } })
    );

    found.push(...page.items);

    if (!page.more || page.items.length === 0) return found;

    after = page.items[page.items.length - 1]!.name;
  }
}

// A deployment's hold as the queue keeps it: a hold whose reason says what it waits for. A hold that does not
// read as one is still a hold.
export function holdOf(value: unknown): DeployHold | null {
  if (value === null || value === undefined) return null;

  const hold = (typeof value === "object" ? value : {}) as { since?: number; until?: number | null; reason?: string; actorName?: string };

  return {
    since: typeof hold.since === "number" ? Math.floor(hold.since / 1000) : 0,
    until: typeof hold.until === "number" ? Math.floor(hold.until / 1000) : 0,
    commits: [],
    breaks: null,
    waitingOn: typeof hold.reason === "string" && hold.reason !== "" ? [hold.reason] : null,
    waitingFor: null,
    passing: []
  };
}

/** An item's reports as the dialog reads them: the closing ones first, the latest leading, then the rest in the
 * order they were written, which is the order bmo-job hands them in. */
export function reportRows(reports: readonly Report[]): TodoReport[] {
  const rows = reports.map((report) => ({ id: report.id, kind: report.kind, body: report.body, actor: report.actorName, at: Math.floor(report.createdAt / 1000) }));

  return [...rows.filter((row) => row.kind === "final").reverse(), ...rows.filter((row) => row.kind !== "final")];
}

// What the panel reads of an item's own reports: every one of them, and the reason a held item was set aside.
function reportsOf(reports: readonly Report[]): { reports: TodoReport[]; heldReason: string | null; heldAt: number | null } {
  const held = reports.filter((report) => report.kind === "held").at(-1);

  return {
    reports: reportRows(reports),
    heldReason: held?.body ?? null,
    heldAt: held === undefined ? null : Math.floor(held.createdAt / 1000)
  };
}

// Whether an approver approved the item: its approvals hold one of the `approval` kind; the chat agent's
// recommendation moves nothing (bmo-job's `docs/api.md`, 「Items」). What says whether it still waits on approval is its
// state alone.
export function approvedItem(item: Pick<Item, "approvals">): boolean {
  return item.approvals.some((approval) => approval.kind === "approval");
}

// Held by its job only until its close's commit goes live: the hold names that deploy, and the close waits on it.
function heldForDeploy(item: Item): boolean {
  return item.state === "held" && (item.labels["hold-after-deploy"] ?? "").trim() !== "" && item.labels["close-phase"] === "waiting-live";
}

function listOf(item: Item): "queue" | "pending" | "held" | "done" {
  if (item.state === "done" || item.state === "dropped" || item.state === "merged" || item.mergedInto !== null) return "done";
  if (item.state === "held" && !heldForDeploy(item)) return "held";
  // A draft waits on the owner wherever it was filed; every other state is past approval, an item opened by itself
  // under an unattended label among them (bmo-job's `docs/api.md`, 「Unattended labels」).
  if (item.state === "draft") return "pending";

  return "queue";
}

// Where the item's close stands, out of the two labels bmo-job's close writes (its docs/cli.md, 「`bmo-job job
// close`」); none where the phase label is absent or says anything else.
function closingOf(labels: Record<string, string>): TodoItem["closing"] {
  const phase = labels["close-phase"];

  if (phase !== "testing" && phase !== "waiting-live") return null;

  return { phase, commit: (labels["close-commit"] ?? "").trim() || null };
}

// One item as the row the panel shows, with its reports where they were read, the last note where a screen opens
// it, and the state the job of it stands in where one is under way.
function itemOf(item: Item, reports: readonly Report[] = [], note: string | null = null, live: LiveJobOf | null = null, stopped = false): TodoItem {
  const said = reportsOf(reports);
  const liveState = live?.state ?? null;

  return {
    id: item.id,
    title: item.title,
    instruction: item.brief,
    brief: item.brief,
    requester: item.requesterName ?? "",
    requesterId: null,
    chatId: null,
    approved: approvedItem(item),
    awaitingApproval: item.state === "draft",
    recommended: item.approvals.some((approval) => approval.kind === "recommendation"),
    done: item.state === "done" || item.state === "dropped" || item.state === "merged" || item.mergedInto !== null,
    running: item.state === "leased",
    liveState,
    // Done in bmo-job while the agency's job for it still goes: its report is still going out, until the agency says
    // the job ended (docs/web.md, the TODO panel's section).
    reporting: item.state === "done" && liveState !== null,
    priority: item.priority,
    status: item.state,
    model: namedLabel(item.labels, "model"),
    agent: namedLabel(item.labels, "agent"),
    role: namedLabel(item.labels, "role"),
    // The agent the job under way runs on, the agency's own word for it, never the item's label (docs/web.md, the TODO
    // panel's section): the label may name the next launch's agent, and the job keeps the one it was launched with.
    jobAgent: live?.agent ?? null,
    ranOn: null,
    worker: item.assigneeName,
    attempts: 1,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false,
    closing: closingOf(item.labels),
    deployHeld: heldForDeploy(item),
    // A held item with a stop note stands in front of a job that is still winding down until that job ends.
    holdPending: stopped && liveState !== null,
    orderActive: false,
    seconds: null,
    spans: [],
    note,
    reports: said.reports,
    rejections: item.rejections,
    unfinished: null,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    heldAt: said.heldAt,
    heldReason: said.heldReason,
    heldKind: item.state === "held" && !heldForDeploy(item) ? (stopped ? "stop" : "pause") : null,
    mergedInto: item.mergedInto,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    createdAt: Math.floor(item.createdAt / 1000),
    doneAt: seconds(item.endedAt)
  };
}

// The state every item's own job stands in while one is under way, as the agency's `running` filter lists them; a
// job under its orderer's review still holds its agent's seat, so it stands as running. A job that names a hold,
// `starting` or with a turn of its review to come, waits — for its agent's seat, a road or a card — and works on
// nothing yet (agency's `docs/api.md`, 「assignments and jobs」, and `docs/job-review.md`). An item with no such job
// has no live state, its lease notwithstanding: a launch leases the item before the agency writes its job.
type LiveJob = { id: number; itemId: number; state: string; heldFor: string | null; agentName?: string | null };

// What a row reads of the job under way for its item: the job, the state it stands in and the agent it runs on.
type LiveJobOf = { job: number; state: NonNullable<TodoItem["liveState"]>; agent: string | null };

function liveStateOfJob(job: LiveJob): NonNullable<TodoItem["liveState"]> {
  if (job.heldFor !== null) return "waiting";

  return job.state === "starting" ? "starting" : "running";
}

function liveJobOf(job: LiveJob): LiveJobOf {
  const agent = (job.agentName ?? "").trim();

  return { job: job.id, state: liveStateOfJob(job), agent: agent === "" ? null : agent };
}

function isLive(job: LiveJob): boolean {
  return job.itemId > 0 && isJobUnderWay(job.state);
}

async function liveStates(): Promise<Map<number, LiveJobOf>> {
  try {
    const jobs = await agencyCall(agency().GET("/jobs", { params: { query: { running: true, limit: 500 } } }));

    return new Map(jobs.items.filter(isLive).map((job) => [job.itemId, liveJobOf(job)]));
  } catch {
    // The item list reads either way; a job nothing says of stands no state of its own.
    return new Map();
  }
}

/** The job under way for one item, its state and its agent, or null where none is. */
export async function liveJobOfItem(id: number): Promise<LiveJobOf | null> {
  try {
    const jobs = await agencyCall(agency().GET("/jobs", { params: { query: { itemId: id, running: true, limit: 5 } } }));
    const job = jobs.items.find((one) => one.itemId === id && isLive(one));

    return job === undefined ? null : liveJobOf(job);
  } catch {
    return null;
  }
}

/** One item by its number, or null where there is no such item. */
export async function readTodoItem(id: number): Promise<TodoItem | null> {
  try {
    const [item, notes, reports, live] = await Promise.all([
      jobCall(job().GET("/items/{itemId}", { params: { path: { itemId: id } } })),
      notesOf(id),
      reportsOfItem(id),
      liveJobOfItem(id)
    ]);

    keptReports.set(id, { changedAt: item.changedAt, readAt: Date.now(), reports });

    return itemOf(item, reports, notes.map((note) => note.text).at(-1) ?? null, live, notes.at(-1)?.labels.kind === "stop");
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

/** Several items by their numbers, in number order; a number with no item behind it is left out. */
export async function readTodoItems(ids: readonly number[]): Promise<TodoItem[]> {
  if (ids.length === 0) return [];

  const [page, live] = await Promise.all([
    jobCall(job().GET("/items", { params: { query: { ids: [...new Set(ids)].sort((one, other) => one - other).join(","), limit: 500 } } })),
    liveStates()
  ]);

  return page.items.map((item) => itemOf(item, [], null, live.get(item.id) ?? null));
}

async function notesOf(todoId: number): Promise<Note[]> {
  return (await jobCall(job().GET("/items/{itemId}/notes", { params: { path: { itemId: todoId }, query: { limit: 500 } } }))).items;
}

/** Every report bmo-job keeps of an item, oldest first, read afresh. */
export async function reportsOfItem(todoId: number): Promise<Report[]> {
  return (await jobCall(job().GET("/items/{itemId}/reports", { params: { path: { itemId: todoId } } }))).items;
}

/** An item's review as the dialog reads it, every entry in the order it was written, afresh. */
export async function readTodoReviews(todoId: number): Promise<TodoReview[]> {
  const entries: TodoReview[] = [];
  let after: number | undefined;

  for (;;) {
    const page = await jobCall(
      job().GET("/items/{itemId}/reviews", { params: { path: { itemId: todoId }, query: { after, limit: 500 } } })
    );

    for (const entry of page.items) {
      entries.push({
        id: entry.id,
        kind: entry.kind,
        stage: entry.stage ?? null,
        round: entry.round,
        body: entry.body,
        actor: entry.actorName,
        check: entry.labels.check ?? null,
        at: Math.floor(entry.createdAt / 1000),
      });
    }

    after = page.items.at(-1)?.id;

    if (!page.more || after === undefined) return entries;
  }
}

/** An item's reports as the dialog reads them, afresh. */
export async function readTodoReports(todoId: number): Promise<TodoReport[]> {
  return reportRows(await reportsOfItem(todoId));
}

// The reports the board read of each item, with the item's `changedAt` at the reading and when it was read. bmo-job's
// rows carry no count of their reports, so the board reads them item by item, and a reading stands for a minute
// while the item is unchanged (docs/boundary.md, 「Gaps the console meets」).
const keptReports = new Map<number, { changedAt: number | null; readAt: number; reports: Report[] }>();

// How many items' reports the board reads at once.
const REPORT_READS_AT_ONCE = 8;

// The reports of the items the board hands over, by item: each read again only where the minute is up or the item
// changed since. An item whose reports could not be read stands with none, as the item it is.
async function boardReports(items: readonly Item[]): Promise<Map<number, Report[]>> {
  const now = Date.now();
  const found = new Map<number, Report[]>();
  const stale = items.filter((item) => {
    const kept = keptReports.get(item.id);

    if (kept !== undefined && kept.changedAt === item.changedAt && now - kept.readAt < TODO_REPORTS_FRESH_MS) {
      found.set(item.id, kept.reports);
      return false;
    }

    return true;
  });

  for (let at = 0; at < stale.length; at += REPORT_READS_AT_ONCE) {
    await Promise.all(
      stale.slice(at, at + REPORT_READS_AT_ONCE).map(async (item) => {
        try {
          const read = await reportsOfItem(item.id);

          keptReports.set(item.id, { changedAt: item.changedAt, readAt: Date.now(), reports: read });
          found.set(item.id, read);
        } catch {
          found.set(item.id, []);
        }
      })
    );
  }

  return found;
}

/** The words added to one item, oldest first, as its notes carry them. */
export async function readTodoNotes(todoId: number): Promise<TodoNote[]> {
  return (await notesOf(todoId)).map((note) => ({
    id: note.id,
    todoId,
    author: note.actorName,
    authorId: null,
    text: note.text,
    addedAt: Math.floor(note.createdAt / 1000),
    jobId: null,
    deliveredAt: null,
    carried: false,
    kind: null,
    removedAt: null,
    removedBy: null
  }));
}

// Whether a line meets the conditions a line carries enough to judge. What the fixed item does not carry — an
// unfinished note's state and the room it came from — is met by no line where a condition names it.
function meets(item: Item, conditions: TodoConditions): boolean {
  const worker = item.assigneeName ?? WORKER_AGENT;

  if (conditions.worker !== null && worker !== conditions.worker) return false;
  if (conditions.requester !== null && (item.requesterName ?? "") !== conditions.requester) return false;
  if (conditions.unfinished !== null) return false;

  return true;
}

// A queue line counts as running where its row reads so: its job starting or working, waiting for nothing
// (docs/web.md, the TODO panel's section).
function standingOf(items: readonly Item[], live: ReadonlyMap<number, LiveJobOf>): TodoStanding {
  const going = (item: Item) => live.get(item.id)?.state === "starting" || live.get(item.id)?.state === "running";

  return {
    queue: items.filter((item) => listOf(item) === "queue").length,
    running: items.filter((item) => listOf(item) === "queue" && going(item)).length,
    pending: items.filter((item) => listOf(item) === "pending").length,
    held: items.filter((item) => listOf(item) === "held").length,
    merged: 0
  };
}

/**
 * The lists the panel stands on, read from bmo-job: the queue, what waits on the owner, what is set aside and what
 * is finished, narrowed by its conditions and its search. The items are read whole in one walk; a finished item
 * beyond the page in hand is not read at all.
 */
export async function readTodoBoard(
  input: { limit?: number; query?: string | null; conditions?: TodoConditions } = {}
): Promise<TodoBoard> {
  const limit = input.limit ?? DONE_PAGE_SIZE;
  const query = input.query ?? null;
  const conditions = input.conditions ?? NO_CONDITIONS;
  const [items, queues, live] = await Promise.all([allItems(), readQueues(), liveStates()]);
  const matching = items.filter((item) => meets(item, conditions));
  const finished = matching.filter((item) => listOf(item) === "done").sort((one, other) => other.id - one.id);
  const finishedFound = query === null
    ? finished
    : filterRecords(finished, (item) => [{ label: "", text: `#${item.id} ${item.title} ${item.state}`, shown: true }], query);
  const page = finishedFound.slice(0, limit);
  const held = matching.filter((item) => listOf(item) === "held");
  const reports = await boardReports([...page, ...held]);
  // A held row says why it was set aside by its last note: the owner's stop, or a plain hold.
  const stopped = new Map(
    await Promise.all(held.map(async (item) => [item.id, (await notesOf(item.id)).at(-1)?.labels.kind === "stop"] as const))
  );
  const rows = new Map(
    matching.map((item) => [item.id, itemOf(item, reports.get(item.id) ?? [], null, live.get(item.id) ?? null, stopped.get(item.id) ?? false)])
  );
  const found = (row: TodoItem) => query === null || filterRecords([row], (one) => todoSearchFields(wording, one, []), query).length > 0;
  const listed = (name: "queue" | "pending" | "held", from: readonly Item[]) =>
    from.filter((item) => listOf(item) === name).flatMap((item) => rows.get(item.id) ?? []).filter(found);
  const choices: TodoChoices = {
    workers: [...new Set(items.map((item) => item.assigneeName ?? WORKER_AGENT))],
    chats: [],
    requesters: [...new Set(items.flatMap((item) => (item.requesterName === null ? [] : [item.requesterName])))]
  };
  const holds = queues.flatMap((queue) => queue.holds);

  return {
    queue: listed("queue", matching),
    pending: listed("pending", matching),
    held: listed("held", matching),
    merged: [],
    done: page.flatMap((item) => rows.get(item.id) ?? []),
    doneTotal: finishedFound.length,
    standingNotes: [],
    choices,
    standing: standingOf(matching, live),
    paused: queues.length > 0 && queues.every((queue) => queue.state === "paused"),
    deployHold: holds.length === 0 ? null : holdOf(holds[0])
  };
}
