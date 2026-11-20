import { DONE_MAX, DONE_PAGE_SIZE, TODO_REPORTS_FRESH_MS, TODO_SEARCH_LIMIT, UNFINISHED_PAIR_MS, WORKER_AGENT } from "#shared/config";
import { filterRecords } from "bmo-ui/shared/search";
import { wording } from "#shared/wording";
import { NO_CONDITIONS, NO_ROOM, todoSearchFields, unfinishedState } from "../../app/domain/todos";
import { agency, agencyCall, isJobUnderWay } from "./agency";
import { job, jobCall, ownersWaitingQuestions } from "./job";
import { namedLabel } from "./todo-assignment";

import type { Note, Item, Report, Queue } from "bmo-job-client";
import type { DeployHold, TodoBoard, TodoBoardRow, TodoChoices, TodoItem, TodoNote, TodoReport, TodoReview, TodoStanding } from "#shared/types";
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
async function allItems(query: { q?: string; state?: string } = {}): Promise<Item[]> {
  const found: Item[] = [];
  let after: number | undefined;

  for (;;) {
    const page = await jobCall(
      job().GET("/items", {
        params: { query: { limit: 500, ...(after === undefined ? {} : { after }), ...(query.q === undefined ? {} : { q: query.q }), ...(query.state === undefined ? {} : { state: query.state }) } }
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
 * order they were written, which is the order bmo-job hands them in. The report its unfinished note is read from
 * stands as that note alone. */
export function reportRows(reports: readonly Report[]): TodoReport[] {
  const note = noteReport(reports);
  const rows = reports.filter((report) => report !== note).map((report) => ({ id: report.id, kind: report.kind, body: report.body, actor: report.actorName, at: Math.floor(report.createdAt / 1000) }));

  return [...rows.filter((row) => row.kind === "final").reverse(), ...rows.filter((row) => row.kind !== "final")];
}

// The labels an item keeps its unfinished note's resolution in, and the one an item carried over from the old board
// keeps the note itself in (docs/web.md, the TODO panel's section).
const UNFINISHED_LABEL = "unfinished";
const RESOLVED_AT_LABEL = "unfinished_resolved_at";
const RESOLUTION_LABEL = "unfinished_resolution";

// The report an item's unfinished note is read from: the latest held report whose very next report is a final one by
// the same writer, written close enough behind it to be the account bmo-job's `todo --done` wrote with the note. A
// hold's reason and a run's stop-here account stand with no final report written with them. Null where none pairs so.
function noteReport(reports: readonly Report[]): Report | null {
  for (let at = reports.length - 2; at >= 0; at -= 1) {
    const report = reports[at]!;
    const next = reports[at + 1]!;
    const paired = next.kind === "final" && next.actorName === report.actorName && next.createdAt - report.createdAt <= UNFINISHED_PAIR_MS;

    if (report.kind === "held" && paired) return report;
  }

  return null;
}

type Unfinished = Pick<TodoItem, "unfinished" | "unfinishedResolvedAt" | "unfinishedResolution">;

const NO_UNFINISHED: Unfinished = { unfinished: null, unfinishedResolvedAt: null, unfinishedResolution: null };

/** An item's unfinished note and its resolution: the note from its reports, else from the label an item carried over
 * from the old board keeps it in, and the resolution its labels keep, unless the note was written after it. */
export function unfinishedOf(item: Pick<Item, "labels">, reports: readonly Report[]): Unfinished {
  const report = noteReport(reports);
  const note = report?.body ?? (item.labels[UNFINISHED_LABEL]?.trim() || null);

  if (note === null) return NO_UNFINISHED;

  const resolvedAt = Number(item.labels[RESOLVED_AT_LABEL]);
  const holds = Number.isInteger(resolvedAt) && resolvedAt > 0 && (report === null || Math.floor(report.createdAt / 1000) <= resolvedAt);

  return { unfinished: note, unfinishedResolvedAt: holds ? resolvedAt : null, unfinishedResolution: holds ? (item.labels[RESOLUTION_LABEL] ?? "") : null };
}

/** An item's labels with its unfinished note resolved at a moment, in epoch milliseconds, by the line saying why; every
 * other label kept as it stands. */
export function labelsResolving(labels: Record<string, string>, why: string, at: number): Record<string, string> {
  return { ...labels, [RESOLVED_AT_LABEL]: String(Math.floor(at / 1000)), [RESOLUTION_LABEL]: why };
}

// The label an item held before bmo-job kept a hold's reason may carry: the moment the console set it aside, in epoch
// milliseconds.
const HELD_SINCE_LABEL = "held-since";

// The moment such a hold set the item aside, where its label says one.
function heldSince(labels: Record<string, string>): number | null {
  const since = Number(labels[HELD_SINCE_LABEL]);

  return Number.isFinite(since) && since > 0 ? since : null;
}

// Why and since when a held item was set aside: the hold bmo-job keeps on it, else, for an item held before bmo-job kept
// one, its latest held report no older than the moment its label names. An item with neither says when, where its
// label says it, and nothing of why (docs/web.md, the TODO panel's section).
function heldOf(item: Item, reports: readonly Report[]): { heldReason: string | null; heldAt: number | null } {
  if (item.hold !== null) return { heldReason: item.hold.reason, heldAt: Math.floor(item.hold.at / 1000) };

  const since = heldSince(item.labels);
  const held = reports.filter((report) => report.kind === "held" && (since === null || report.createdAt >= since)).at(-1);
  const at = held?.createdAt ?? since;

  return { heldReason: held?.body ?? null, heldAt: at === null ? null : Math.floor(at / 1000) };
}

// Whether an approver approved the item: its approvals hold one of the `approval` kind; the chat agent's
// recommendation moves nothing (bmo-job's `docs/api.md`, 「Items」). What says whether it still waits on approval is its
// state alone.
export function approvedItem(item: Pick<Item, "approvals">): boolean {
  return item.approvals.some((approval) => approval.kind === "approval");
}

type ClosePhase = NonNullable<TodoItem["closing"]>["phase"];

// The labels bmo-job's close writes (its docs/cli.md, 「`bmo-job job close`」): a pair for each repository, the
// repository after the colon, beside a pair with no repository that sums them up.
const CLOSE_PHASE = "close-phase";
const CLOSE_COMMIT = "close-commit";

// Whether a close's phase says its commit waits to go live: merged and waiting for its repository's batch deployment,
// or handed over by an older close.
function waitsToGoLive(phase: string | undefined): boolean {
  return phase === "waiting-batch" || phase === "waiting-live";
}

function closePhase(value: string | undefined): ClosePhase | null {
  return value === "testing" || value === "waiting-batch" || value === "waiting-live" ? value : null;
}

function closeCommit(value: string | undefined): string | null {
  return (value ?? "").trim() || null;
}

// The repositories the item's labels carry a pair of, in name order.
function pairRepositories(labels: Record<string, string>): string[] {
  return Object.keys(labels)
    .filter((key) => key.startsWith(`${CLOSE_PHASE}:`) && key.length > CLOSE_PHASE.length + 1)
    .map((key) => key.slice(CLOSE_PHASE.length + 1))
    .sort();
}

// Where the item's close stands (docs/web.md, the TODO panel's section): read from the pair of each repository where
// the item carries one, checking while any of them checks and else waiting on every commit they leave waiting, and
// otherwise from the pair with no repository, its one commit of no named repository. None where the labels say
// neither; a repository's pair whose phase says neither is passed over.
function closingOf(labels: Record<string, string>): TodoItem["closing"] {
  const repositories = pairRepositories(labels);

  if (repositories.length === 0) {
    const phase = closePhase(labels[CLOSE_PHASE]);

    if (phase === null) return null;

    return { phase, waiting: waitsToGoLive(phase) ? [{ repository: null, commit: closeCommit(labels[CLOSE_COMMIT]) }] : [] };
  }

  const phaseOf = (repository: string) => labels[`${CLOSE_PHASE}:${repository}`];
  const waiting = repositories
    .filter((repository) => waitsToGoLive(phaseOf(repository)))
    .map((repository) => ({ repository, commit: closeCommit(labels[`${CLOSE_COMMIT}:${repository}`]) }));

  if (repositories.some((repository) => phaseOf(repository) === "testing")) return { phase: "testing", waiting };

  return waiting.length === 0 ? null : { phase: "waiting-batch", waiting };
}

// Whether the item's close merged its commits and waits for them all to go live, no repository's check under way.
function waitsForDeploy(item: Item): boolean {
  return waitsToGoLive(closingOf(item.labels)?.phase);
}

// Held by its job only until its close's commits go live: the hold names that deploy, and the commits wait for it.
function heldForDeploy(item: Item): boolean {
  return item.state === "held" && (item.labels["hold-after-deploy"] ?? "").trim() !== "" && waitsForDeploy(item);
}

// The items a merged one is read against, by number: the item carrying it and the ones merged into it.
type Items = ReadonlyMap<number, Item>;

const NO_ITEMS: Items = new Map();

const byNumber = (items: readonly Item[]): Items => new Map(items.map((item) => [item.id, item]));

const isMerged = (item: Item): boolean => item.state === "merged" || item.mergedInto !== null;

// The item carrying a merged one: the first along its merges that is not merged itself. Null where a merge names an
// item not among those read, or the merges turn back on themselves.
function carrierOf(item: Item, items: Items): Item | null {
  const seen = new Set<number>([item.id]);
  let at = item;

  while (isMerged(at)) {
    const next = at.mergedInto === null ? undefined : items.get(at.mergedInto);

    if (next === undefined || seen.has(next.id)) return null;

    seen.add(next.id);
    at = next;
  }

  return at;
}

// Whether a merged item still waits on the item carrying it: that item stands unfinished. One whose carrier is
// finished, or cannot be read, is finished with it (docs/web.md, the TODO panel's section).
function waitsOnCarrier(item: Item, items: Items): boolean {
  if (!isMerged(item)) return false;

  const carrier = carrierOf(item, items);

  return carrier !== null && carrier.state !== "done" && carrier.state !== "dropped";
}

const isFinished = (item: Item, items: Items): boolean =>
  item.state === "done" || item.state === "dropped" || (isMerged(item) && !waitsOnCarrier(item, items));

type List = "queue" | "pending" | "held" | "merged" | "done";

function listOf(item: Item, items: Items): List {
  if (isFinished(item, items)) return "done";
  if (isMerged(item)) return "merged";
  if (item.state === "held" && !heldForDeploy(item)) return "held";
  // A draft waits on the owner wherever it was filed; every other state is past approval, an item opened by itself
  // under an unattended label among them (bmo-job's `docs/api.md`, 「Unattended labels」).
  if (item.state === "draft") return "pending";

  return "queue";
}

// One item as the row the panel shows, with its reports where they were read, the last note where a screen opens
// it, and the state the job of it stands in where one is under way.
function itemOf(
  item: Item,
  reports: readonly Report[] = [],
  note: string | null = null,
  live: LiveJobOf | null = null,
  stopped = false,
  items: Items = NO_ITEMS
): TodoItem {
  const held = heldOf(item, reports);
  const liveState = live?.state ?? null;
  const finished = isFinished(item, items);

  return {
    id: item.id,
    title: item.title,
    instruction: item.brief,
    requester: item.requesterName ?? "",
    requesterId: null,
    chatId: null,
    approved: approvedItem(item),
    awaitingApproval: item.state === "draft",
    recommended: item.approvals.some((approval) => approval.kind === "recommendation"),
    done: finished,
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
    reports: reportRows(reports),
    rejections: item.rejections,
    // Only finished work leaves a note behind (docs/web.md, the TODO panel's section).
    ...(finished ? unfinishedOf(item, reports) : NO_UNFINISHED),
    // A hold's time and reason, read only while the item is held, so a released item says nothing of an earlier hold.
    heldAt: item.state === "held" ? held.heldAt : null,
    heldReason: item.state === "held" ? held.heldReason : null,
    // Held by the owner's stop, or a plain hold: bmo-job keeps no wind-down of its own, so none reads as one (docs/web.md,
    // the TODO panel's section).
    heldKind: item.state === "held" && !heldForDeploy(item) && stopped ? "stop" : null,
    noticesOff: item.noticesOff === null ? null : { reason: item.noticesOff.reason, at: Math.floor(item.noticesOff.at / 1000) },
    mergedInto: item.mergedInto,
    // bmo-job ends an item as it merges it, so the moment it ended is the moment of its merge.
    mergedAt: isMerged(item) ? seconds(item.endedAt) : null,
    mergedIntoTitle: item.mergedInto === null ? null : (items.get(item.mergedInto)?.title ?? null),
    mergedFrom: [...items.values()]
      .filter((one) => one.mergedInto === item.id)
      .sort((one, other) => one.id - other.id)
      .map((one) => ({ id: one.id, title: one.title, done: isFinished(one, items) })),
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

/** The job under way of every item one runs for, by its item; empty where the agency does not answer. */
export async function liveStates(): Promise<Map<number, LiveJobOf>> {
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

    return itemOf(
      item,
      reports,
      notes.map((note) => note.text).at(-1) ?? null,
      live,
      notes.at(-1)?.labels.kind === "stop",
      await mergesAround(item)
    );
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

// The items several items' merges are read against, read once where any of them is merged or may carry one.
async function mergesAmong(items: readonly Item[]): Promise<Items> {
  const found = new Map<number, Item>();

  for (const item of items) {
    for (const [id, one] of await mergesAround(item)) found.set(id, one);
  }

  return found;
}

// The items one item's merges are read against: every merged item, among which those merged into it stand, and the
// items its own merges lead through to the one carrying it. A merge that cannot be read leaves the item read alone.
async function mergesAround(item: Item): Promise<Items> {
  try {
    const found = new Map<number, Item>((await allItems({ state: "merged" })).map((one) => [one.id, one]));
    let at: Item = item;

    found.set(item.id, item);

    while (at.mergedInto !== null && !found.has(at.mergedInto)) {
      at = await jobCall(job().GET("/items/{itemId}", { params: { path: { itemId: at.mergedInto } } }));
      found.set(at.id, at);
    }

    return found;
  } catch {
    return byNumber([item]);
  }
}

/** Several items by their numbers, in number order; a number with no item behind it is left out. */
export async function readTodoItems(ids: readonly number[]): Promise<TodoItem[]> {
  if (ids.length === 0) return [];

  const [page, live] = await Promise.all([
    jobCall(job().GET("/items", { params: { query: { ids: [...new Set(ids)].sort((one, other) => one - other).join(","), limit: 500 } } })),
    liveStates()
  ]);

  const all = await mergesAmong(page.items);

  return page.items.map((item) => itemOf(item, [], null, live.get(item.id) ?? null, false, all));
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

// What a line's conditions are judged against beyond its own fields: the items waiting on the owner's answer, read
// where the question condition asks for them, and the items and the reports read of every finished one, where the
// unfinished condition asks for them.
interface Readings {
  awaiting: ReadonlySet<number>;
  all: Items;
  reports: ReadonlyMap<number, Report[]>;
}

// Whether a line meets the conditions: its own fields, whether one of its questions waits on the owner's answer, and
// its unfinished note's state; an item not finished yet has left no note, so it meets neither choice of that. The room
// a line came from is not on the fixed item, and no condition reads it.
function meets(item: Item, conditions: TodoConditions, readings: Readings): boolean {
  const worker = item.assigneeName ?? WORKER_AGENT;

  if (conditions.worker !== null && worker !== conditions.worker) return false;
  if (conditions.requester !== null && (item.requesterName ?? "") !== conditions.requester) return false;
  if (conditions.question === "awaiting" && !readings.awaiting.has(item.id)) return false;

  if (conditions.unfinished !== null) {
    const note = unfinishedOf(item, readings.reports.get(item.id) ?? []);

    if (!isFinished(item, readings.all) || unfinishedState(note) !== conditions.unfinished) return false;
  }

  return true;
}

// The items one of whose questions waits on the owner's answer, read only where the question condition asks for them,
// from the same reading the row's chip stands on (docs/web.md, 「A job standing on a question says so where the owner
// looks」).
async function awaitingItems(conditions: TodoConditions): Promise<Set<number>> {
  if (conditions.question === null) return new Set();

  return new Set((await ownersWaitingQuestions()).flatMap((question) => (question.itemId === null ? [] : [question.itemId])));
}

// The list a line stands in as its row reads it: an item held by a stop whose run is still ending stands in the queue
// under its own word until the run has ended, and joins the holds after (docs/web.md, the TODO panel's section).
function rowList(item: Item, row: TodoItem | undefined, items: Items): List {
  const list = listOf(item, items);

  return list === "held" && row?.holdPending === true ? "queue" : list;
}

// A queue line counts as running where its row reads so: its job starting or working, waiting for nothing
// (docs/web.md, the TODO panel's section).
function standingOf(
  items: readonly Item[],
  live: ReadonlyMap<number, LiveJobOf>,
  rows: ReadonlyMap<number, TodoItem>,
  all: Items
): TodoStanding {
  const going = (item: Item) => live.get(item.id)?.state === "starting" || live.get(item.id)?.state === "running";
  const inList = (item: Item, list: List) => rowList(item, rows.get(item.id), all) === list;

  return {
    queue: items.filter((item) => inList(item, "queue")).length,
    running: items.filter((item) => inList(item, "queue") && going(item) && !waitsForDeploy(item)).length,
    deploy: items.filter((item) => inList(item, "queue") && waitsForDeploy(item)).length,
    deploying: 0,
    pending: items.filter((item) => inList(item, "pending")).length,
    held: items.filter((item) => inList(item, "held")).length,
    merged: items.filter((item) => inList(item, "merged")).length
  };
}

// Each item as its line on the board reads it: the reports of the ones given, which are the finished and the held,
// and why a held one was set aside, by its last note: the owner's stop, or a plain hold.
async function boardRows(
  items: readonly Item[],
  reported: readonly Item[],
  live: ReadonlyMap<number, LiveJobOf>,
  all: Items
): Promise<Map<number, TodoItem>> {
  const reports = await boardReports(reported);
  const stopped = new Map(
    await Promise.all(
      items.filter((item) => listOf(item, all) === "held").map(async (item) => [item.id, (await notesOf(item.id)).at(-1)?.labels.kind === "stop"] as const)
    )
  );

  return new Map(
    items.map((item) => [item.id, itemOf(item, reports.get(item.id) ?? [], null, live.get(item.id) ?? null, stopped.get(item.id) ?? false, all)])
  );
}

/**
 * Some of the board's lines, each as the board reads it and with the list it stands in, for a word naming the items
 * it moved (docs/web.md, the TODO panel's section). A number with no item behind it is left out.
 */
export async function readBoardRows(ids: readonly number[]): Promise<TodoBoardRow[]> {
  if (ids.length === 0) return [];

  const [page, live] = await Promise.all([
    jobCall(job().GET("/items", { params: { query: { ids: [...new Set(ids)].sort((one, other) => one - other).join(","), limit: 500 } } })),
    liveStates()
  ]);
  const all = await mergesAmong(page.items);
  const reported = page.items.filter((item) => listOf(item, all) === "done" || listOf(item, all) === "held");
  const rows = await boardRows(page.items, reported, live, all);

  return page.items.flatMap((item) => {
    const row = rows.get(item.id);

    return row === undefined ? [] : [{ list: rowList(item, row, all), item: row }];
  });
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
  const [items, queues, live, awaiting] = await Promise.all([allItems(), readQueues(), liveStates(), awaitingItems(conditions)]);
  const all = byNumber(items);
  // No item's line carries its unfinished note, so the condition on one reads the reports of every finished item,
  // kept as the page's are (docs/boundary.md, 「Gaps the console meets」).
  const reports = conditions.unfinished === null ? new Map<number, Report[]>() : await boardReports(items.filter((item) => isFinished(item, all)));
  const matching = items.filter((item) => meets(item, conditions, { awaiting, all, reports }));
  const finished = matching.filter((item) => listOf(item, all) === "done").sort((one, other) => other.id - one.id);
  const finishedFound = query === null
    ? finished
    : filterRecords(finished, (item) => [{ label: "", text: `#${item.id} ${item.title} ${item.state}`, shown: true }], query);
  const page = finishedFound.slice(0, limit);
  const held = matching.filter((item) => listOf(item, all) === "held");
  const rows = await boardRows(matching, [...page, ...held], live, all);
  const found = (row: TodoItem) => query === null || filterRecords([row], (one) => todoSearchFields(wording, one, []), query).length > 0;
  const listed = (name: List, from: readonly Item[]) =>
    from.filter((item) => rowList(item, rows.get(item.id), all) === name).flatMap((item) => rows.get(item.id) ?? []).filter(found);
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
    merged: listed("merged", matching),
    done: page.flatMap((item) => rows.get(item.id) ?? []),
    doneTotal: finishedFound.length,
    standingNotes: [],
    choices,
    standing: standingOf(matching, live, rows, all),
    paused: queues.length > 0 && queues.every((queue) => queue.state === "paused"),
    deployHold: holds.length === 0 ? null : holdOf(holds[0])
  };
}
