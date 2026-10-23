import { DONE_MAX, DONE_PAGE_SIZE, TODO_SEARCH_LIMIT, WORKER_AGENT } from "#shared/config";
import { filterRecords } from "bmo-ui/shared/search";
import { wording } from "#shared/wording";
import { NO_CONDITIONS, NO_ROOM, todoSearchFields } from "../../app/domain/todos";
import { job, jobCall, JOB_TIMEOUT_MS } from "./job";
import { within } from "./unit-answer";

import type { Note, Item, Report, Queue } from "bmo-job-client";
import type { DeployHold, TodoBoard, TodoChoices, TodoItem, TodoNote, TodoStanding } from "#shared/types";
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
        params: { query: { limit: 500, ...(after === undefined ? {} : { after }), ...(query.q === undefined ? {} : { q: query.q }) } },
        signal: within(JOB_TIMEOUT_MS)
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
      job().GET("/queues", { params: { query: { limit: 500, ...(after === undefined ? {} : { after }) } }, signal: within(JOB_TIMEOUT_MS) })
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

// What the panel reads of an item's own reports: the account of the work when there is one, and the reason a
// held item was set aside.
function reportsOf(reports: readonly Report[]): { report: string | null; heldReason: string | null; heldAt: number | null } {
  const final = reports.filter((report) => report.kind === "final").at(-1);
  const held = reports.filter((report) => report.kind === "held").at(-1);

  return {
    report: final?.body ?? null,
    heldReason: held?.body ?? null,
    heldAt: held === undefined ? null : Math.floor(held.createdAt / 1000)
  };
}

function listOf(item: Item): "queue" | "pending" | "held" | "done" {
  if (item.state === "done" || item.state === "dropped" || item.state === "merged" || item.mergedInto !== null) return "done";
  if (item.state === "held") return "held";
  // An item the owner has not approved waits on him wherever it was filed, as the row's own state says
  // (`todoState`): its filing is open, but it is in no queue until his approval puts it there.
  if (item.approvals.length === 0) return "pending";

  return "queue";
}

// One item as the row the panel shows; its notes and reports are read where a screen opens it.
function itemOf(item: Item, reports: readonly Report[] = [], note: string | null = null): TodoItem {
  const said = reportsOf(reports);

  return {
    id: item.id,
    title: item.title,
    instruction: item.brief,
    brief: item.brief,
    briefRendering: null,
    requester: item.requesterName ?? "",
    requesterId: null,
    chatId: null,
    approved: item.approvals.length > 0,
    done: item.state === "done" || item.state === "dropped" || item.state === "merged" || item.mergedInto !== null,
    running: item.state === "leased",
    priority: item.priority,
    status: item.state,
    model: null,
    ranOn: null,
    worker: item.assigneeName,
    cowork: item.cowork,
    attempts: 1,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false,
    // The job service holds an item by its state, and a lease it had on the item has already ended
    // where the state says held, so none is still on its way there.
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    note,
    report: said.report,
    unfinished: null,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    heldAt: said.heldAt,
    heldReason: said.heldReason,
    heldKind: item.state === "held" ? "pause" : null,
    mergedInto: item.mergedInto,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    createdAt: Math.floor(item.createdAt / 1000),
    doneAt: seconds(item.endedAt)
  };
}

/** One item by its number, or null where there is no such item. */
export async function readTodoItem(id: number): Promise<TodoItem | null> {
  try {
    const [item, notes, reports] = await Promise.all([
      jobCall(job().GET("/items/{itemId}", { params: { path: { itemId: id } }, signal: within(JOB_TIMEOUT_MS) })),
      notesOf(id),
      reportsOfItem(id)
    ]);

    return itemOf(item, reports, notes.map((note) => note.text).at(-1) ?? null);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

/** Several items by their numbers, in number order; a number with no item behind it is left out. */
export async function readTodoItems(ids: readonly number[]): Promise<TodoItem[]> {
  if (ids.length === 0) return [];

  const page = await jobCall(
    job().GET("/items", { params: { query: { ids: [...new Set(ids)].sort((one, other) => one - other).join(","), limit: 500 } }, signal: within(JOB_TIMEOUT_MS) })
  );

  return page.items.map((item) => itemOf(item));
}

async function notesOf(todoId: number): Promise<Note[]> {
  return (await jobCall(job().GET("/items/{itemId}/notes", { params: { path: { itemId: todoId }, query: { limit: 500 } }, signal: within(JOB_TIMEOUT_MS) }))).items;
}

async function reportsOfItem(todoId: number): Promise<Report[]> {
  return (await jobCall(job().GET("/items/{itemId}/reports", { params: { path: { itemId: todoId }, signal: within(JOB_TIMEOUT_MS) } }))).items;
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
  if (conditions.cowork !== null && item.cowork !== (conditions.cowork === "on")) return false;
  if (conditions.requester !== null && (item.requesterName ?? "") !== conditions.requester) return false;
  if (conditions.unfinished !== null) return false;

  return true;
}

function standingOf(items: readonly Item[]): TodoStanding {
  return {
    queue: items.filter((item) => listOf(item) === "queue").length,
    running: items.filter((item) => item.state === "leased").length,
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
  input: { limit?: number; query?: string | null; conditions?: TodoConditions; room?: number | null } = {}
): Promise<TodoBoard> {
  const limit = input.limit ?? DONE_PAGE_SIZE;
  const query = input.query ?? null;
  const conditions = input.conditions ?? NO_CONDITIONS;
  const [items, queues] = await Promise.all([allItems(), readQueues()]);
  const matching = items.filter((item) => meets(item, conditions));
  const finished = matching.filter((item) => listOf(item) === "done").sort((one, other) => other.id - one.id);
  const finishedFound = query === null
    ? finished
    : filterRecords(finished, (item) => [{ label: "", text: `#${item.id} ${item.title} ${item.state}`, shown: true }], query);
  const rows = new Map(matching.map((item) => [item.id, itemOf(item)]));
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
    done: finishedFound.slice(0, limit).flatMap((item) => rows.get(item.id) ?? []),
    doneTotal: finishedFound.length,
    standingNotes: [],
    choices,
    standing: standingOf(matching),
    paused: queues.length > 0 && queues.every((queue) => queue.state === "paused"),
    deployHold: holds.length === 0 ? null : holdOf(holds[0])
  };
}
