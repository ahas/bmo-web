import {
  APPEND_LIMIT,
  isAgentName,
  MODEL_LABEL_LIMIT,
  NOTE_LIMIT,
  RAISE_LIMIT,
  RAISE_TITLE_LIMIT,
  RESOLUTION_LIMIT,
  STOP_REASON_LIMIT,
  STOP_REASON_NEEDED
} from "#shared/config";
import { wording } from "#shared/wording";
import {
  isAssignedModel,
  isRoleName,
  labelsNamingAgent,
  labelsNamingModel,
  requireCandidateOfLabels,
  requireModelCandidate
} from "../utils/todo-assignment";

import type { Item } from "bmo-job-client";
import type { TodoAction, TodoActionResult } from "#shared/types";

interface TodoBody {
  action?: unknown;
  id?: unknown;
  direction?: unknown;
  order?: unknown;
  note?: unknown;
  noteId?: unknown;
  why?: unknown;
  title?: unknown;
  said?: unknown;
  text?: unknown;
  sources?: unknown;
  worker?: unknown;
  model?: unknown;
  role?: unknown;
  agent?: unknown;
}

const ACTIONS: readonly TodoAction[] = [
  "approve",
  "unapprove",
  "move",
  "top",
  "bottom",
  "drop",
  "done",
  "reorder",
  "resolve",
  "raise",
  "append",
  "unappend",
  "hold",
  "stop",
  "release",
  "worker",
  "model",
  "agent"
];

// Changing one row of the TODO. The table is bmo-job's to write, so the console asks and
// bmo-job writes; a bmo-job that is not there changes nothing. Filing from nothing is not among the
// verbs — an item carries the exchange it came from, and that happens in a chat — but raising
// one out of a unfinished note is, because there the exchange is the note itself and the line he writes
// about it, and a unfinished note whose every strand is done or standing as its own row is the only way one
// is ever resolved. Adding words to a row that already stands is here for the same reason the
// raising is: what he thinks of an hour into the work is said at the screen he is watching it
// from, and the only other way to say it is a shell.
export default defineEventHandler(async (event): Promise<TodoActionResult> => {
  // Who is signed in goes to bmo-job where a change carries a name of its own: the words added, a stop's reason, an
  // item raised. An approval carries none, its caller being the one the console's token names.
  const signed = await signedInUser(event);

  const body = await readBody<TodoBody>(event);
  const action = body?.action;
  const id = body?.id;

  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    throw fail(400, wording("todo.error.bad_action"));
  }

  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw fail(400, wording("todo.error.bad_item_id"));
  }

  const direction = body?.direction;

  if (action === "move" && direction !== "up" && direction !== "down") {
    throw fail(400, wording("todo.error.bad_direction"));
  }

  const order = body?.order;

  // Dragging saves the whole queue, so the order is the request: a list of item numbers, and
  // whether it is still bmo-job's own queue is bmo-job's to say.
  if (action === "reorder" && !isOrder(order)) {
    throw fail(400, wording("todo.error.bad_order"));
  }

  const note = body?.note;

  if (note !== undefined && (typeof note !== "string" || note.length > NOTE_LIMIT)) {
    throw fail(400, wording("todo.error.bad_note"));
  }

  const title = body?.title;
  const said = body?.said;
  const sources = body?.sources;

  // A row raised out of a unfinished note needs a name and a reason. Neither is guessed at from the note.
  if (action === "raise") {
    if (typeof title !== "string" || title.trim() === "" || title.length > RAISE_TITLE_LIMIT) {
      throw fail(400, wording("todo.error.raise_title_empty"));
    }

    if (typeof said !== "string" || said.trim() === "" || said.length > RAISE_LIMIT) {
      throw fail(400, wording("todo.error.raise_body_empty"));
    }

    // The other notes he named beside the one he is standing on. Whether each of them left a
    // unfinished note to raise out of is bmo-job's to say; what is checked here is that they are numbers.
    if (sources !== undefined && !isOrder(sources)) {
      throw fail(400, wording("todo.error.bad_source_ids"));
    }
  }

  const text = body?.text;

  // Words added to an item that already stands. There is nothing to add where nothing was
  // typed, and what is added is the next condition of the work rather than a document of its
  // own, so both ends are held here rather than reaching bmo-job.
  if (action === "append" && (typeof text !== "string" || text.trim() === "" || text.length > APPEND_LIMIT)) {
    throw fail(400, wording("todo.error.note_empty"));
  }

  const noteId = body?.noteId;

  // Which of the appended words are being taken back. There is no last one and no implied one: the
  // press is on a particular lot of words, so the number comes with it.
  if (action === "unappend" && (typeof noteId !== "number" || !Number.isInteger(noteId))) {
    throw fail(400, wording("todo.error.note_pick"));
  }

  const why = body?.why;

  // What makes a unfinished note no longer outstanding is the whole of what resolving writes, so a resolving
  // with nothing to say is refused here rather than reaching bmo-job.
  if (action === "resolve" && (typeof why !== "string" || why.trim() === "" || why.length > RESOLUTION_LIMIT)) {
    throw fail(400, wording("todo.error.resolve_reason_empty"));
  }

  // A stop cuts work in flight, so its reason is the one thing the item carries until it is taken
  // up again, and a stop with nothing to say is refused here rather than reaching bmo-job.
  if (action === "stop" && (typeof why !== "string" || why.trim() === "" || why.length > STOP_REASON_LIMIT)) {
    throw fail(400, wording(STOP_REASON_NEEDED));
  }

  const worker = body?.worker;

  // Which worker is to do it. Null takes the assignment off; a name is a name, and whether that
  // worker exists is bmo-job's to say, since the list of them is the archive's.
  if (action === "worker" && worker !== null && !isAgentName(worker)) {
    throw fail(400, wording("todo.error.bad_worker"));
  }

  const model = body?.model;
  const role = body?.role;

  // A model and the role whose agents run it, the launch seating the job on whichever of them is free. Whether the
  // role holds an agent on that model is checked against the agency's listing before anything is written.
  if (action === "model" && !isAssignedModel(model)) {
    throw fail(400, wording("todo.error.bad_model"));
  }

  if (action === "model" && !isRoleName(role)) {
    throw fail(400, wording("todo.error.bad_role"));
  }

  const agent = body?.agent;

  // The agent its jobs go out on: `auto`, or an agent's name as the agency registers it. Whether the agency registers
  // it is the agency's to say as a job of the item is launched.
  if (action === "agent" && !isAgentLabel(agent)) {
    throw fail(400, wording("todo.error.bad_agent"));
  }

  // Each verb is one write on the item, its notes or its queue, as bmo-job's fixed API takes it. A verb the fixed
  // item has no place for — an unfinished note resolved — is refused as one this item cannot take.
  switch (action) {
    case "approve":
      // An item naming a model no agent of its role runs is not approved (docs/web.md, the TODO panel's section).
      await requireCandidateOfLabels((await readItem(id)).labels);
      // Who approves is the caller the console's token names, never a field of the change.
      await patchItem(id, { approval: {} });
      break;
    case "unapprove":
      await patchItem(id, { approval: null });
      break;
    case "drop":
      await patchItem(id, { state: "dropped" });
      break;
    case "done":
      await patchItem(id, { state: "done" });
      break;
    case "hold":
      await patchItem(id, { state: "held" });
      break;
    case "release":
      await patchItem(id, { state: "open" });
      break;
    case "worker":
      await patchItem(id, { assigneeName: worker === null ? null : String(worker) });
      break;
    case "model":
      await requireModelCandidate(role as string, model as string);
      await patchItem(id, { labels: labelsNamingModel((await readItem(id)).labels, model as string, role as string) });
      break;
    case "agent":
      await patchItem(id, { labels: labelsNamingAgent((await readItem(id)).labels, agent as string) });
      break;
    case "append":
      await jobCall(job().POST("/items/{itemId}/notes", {
        params: { path: { itemId: id } },
        body: { text: text as string, actorName: signed.name }
      }));
      break;
    case "unappend":
      await jobCall(job().DELETE("/items/{itemId}/notes/{noteId}", {
        params: { path: { itemId: id, noteId: noteId as number } }
      }));
      break;
    case "stop":
      await jobCall(job().POST("/items/{itemId}/notes", {
        params: { path: { itemId: id } },
        body: { text: why as string, actorName: signed.name, labels: { kind: "stop" } }
      }));
      await patchItem(id, { state: "held" });

      return { ok: true, stopped: 1 };
    case "raise": {
      const queues = await readQueues();
      const queue = queues[0];

      if (queue === undefined) throw fail(503, wording("todo.error.queue_unknown"));

      const raised = await jobCall(job().POST("/items", {
        body: { title: title as string, brief: said as string, queueName: queue.name, requesterName: signed.name }
      }));

      return { ok: true, raised: raised.id };
    }
    case "move":
    case "top":
    case "bottom":
    case "reorder":
      await reposition(action, id, direction, order);
      break;
    default:
      throw fail(400, wording("todo.error.bad_action"));
  }

  return { ok: true };
});

async function patchItem(id: number, change: { state?: "open" | "held" | "done" | "dropped"; approval?: Record<string, never> | null; assigneeName?: string | null; position?: number; labels?: Record<string, string> }): Promise<void> {
  try {
    await jobCall(job().PATCH("/items/{itemId}", {
      params: { path: { itemId: id } },
      body: change
    }));
  } catch (error) {
    throw await frozenByJob(id, error);
  }
}

// bmo-job refuses a change of what a running job's lease holds fixed, `item-frozen` (its docs/api.md, 「While leased」);
// the refusal is said with the job under way and the agent it runs on, as the agency says them, and stays bmo-job's
// own where the agency names no such job (docs/web.md, the TODO panel's section).
async function frozenByJob(id: number, error: unknown): Promise<unknown> {
  if ((error as { data?: { code?: unknown } }).data?.code !== "item-frozen") return error;

  const live = await liveJobOfItem(id);

  if (live === null || live.agent === null) return error;

  return fail(409, wording("todo.error.job_runs_on", { job: live.job, agent: live.agent }));
}

// Where a row stands among its queue's others: a step, the head, the foot, or the whole order the drag leaves.
async function reposition(action: "move" | "top" | "bottom" | "reorder", id: number, direction: unknown, order: unknown): Promise<void> {
  const items = await readTodoBoardItems();
  const positions = new Map(items.map((item) => [item.id, item.position]));

  if (action === "reorder") {
    await Promise.all((order as number[]).map(async (itemId, at) => {
      if (positions.get(itemId) !== at) await patchItem(itemId, { position: at });
    }));

    return;
  }

  const current = positions.get(id);

  if (current === undefined) return;

  const next = action === "move" ? current + (direction === "up" ? -1 : 1) : action === "top" ? Math.min(0, ...positions.values()) - 1 : Math.max(0, ...positions.values()) + 1;

  await patchItem(id, { position: next });
}

// Every item as the queue orders it, read for the positions a move changes.
async function readTodoBoardItems(): Promise<Item[]> {
  const page = await jobCall(job().GET("/items", { params: { query: { limit: 500 } } }));

  return page.items;
}

// The item as bmo-job holds it. bmo-job replaces an item's labels whole, so an assignment is written over the labels
// read here, every other label kept as it stood (docs/web.md, the TODO panel's agent chooser).
async function readItem(id: number): Promise<Item> {
  return await jobCall(job().GET("/items/{itemId}", { params: { path: { itemId: id } } }));
}

function isAgentLabel(value: unknown): value is string {
  return typeof value === "string" && value.length <= MODEL_LABEL_LIMIT && (value === "auto" || /^[a-z][a-z0-9-]*$/.test(value));
}

function isOrder(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isInteger(entry));
}
