import { exactMessageIdOf } from "#shared/message-ids";
import { briefingStateOf } from "#shared/voice-briefings";

import type { BotEvent, VoiceBriefing, WorkOrderProgress } from "#shared/types";

// bmo-job's and the agency's events, as the relay hands them on (docs/web.md, 「How the units are talked to」),
// read into the console's own events, so a screen that reads back on the TODO moving or a turn ending hears
// them as it hears the receiver's. bmo-job's are numbered in its own run and read under its own cursor; the
// agency's are numbered by its stream and read by what each carries.

type Fields = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// What an event carries, as the object it is, or null where it carries none.
function fieldsOf(value: unknown): Fields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : null;
}

// A work order's standing as bmo-job's `order_changed` carries it.
function orderOf(value: unknown): WorkOrderProgress | null {
  const order = fieldsOf(value);

  if (order === null) return null;

  return {
    status: order.status as WorkOrderProgress["status"],
    phase: order.phase as WorkOrderProgress["phase"],
    stage: number(order.stage) ?? 0,
    updatedAt: number(order.updated_at) ?? 0,
    tasks: (Array.isArray(order.tasks) ? (order.tasks as Fields[]) : []).map((task) => ({
      id: text(task.id) ?? "",
      state: task.state as WorkOrderProgress["tasks"][number]["state"],
      attempt: number(task.attempt) ?? 0,
      jobId: number(task.job),
      model: text(task.model) ?? "",
      error: text(task.error)
    }))
  };
}

// The item an event's member belongs to, where it names one: an item by its own number, and every member
// nested under one by the item's.
function itemOf(kind: string, member: Fields): number | null {
  if (kind.startsWith("item.")) return number(member.id);
  if (kind === "queue.changed" || kind === "queue.moved") return null;

  return number(member.itemId) ?? number(member.item);
}

// Whether bmo-job's kind moves the TODO's list, the queue or a question the panel stands.
function todoKind(kind: string): boolean {
  return kind === "queue.changed"
    || kind === "queue.moved"
    || kind.startsWith("item.")
    || kind.startsWith("lease.")
    || kind.startsWith("question.")
    || kind === "reply.created";
}

/**
 * One of bmo-job's events as the console's (bmo-job's `docs/api.md`, 「Events」): an item or its queue moving is
 * the TODO moving, a work order and its tasks moving are that item's work order, and its notes, reports and
 * replies moving are that item's talk. Its id is bmo-job's own, which the caller counts apart from the
 * receiver's; a kind the console reads nothing of is null.
 */
export function jobEvent(data: Fields): BotEvent | null {
  const id = number(data.id);
  const at = number(data.at) ?? 0;
  const kind = text(data.kind);

  if (id === null || kind === null) return null;

  const member = fieldsOf(data.data) ?? data;

  // A kind bmo-job read before its stream named every member: the queue moved, an order changed and the
  // talk moved, with the item at the top of the event.
  if (kind === "queue_moved") return { id, at, type: "todo", chatId: 0, messageId: null };

  if (kind === "order_changed") {
    const item = number(data.item);
    const workOrder = orderOf(data.order);

    return item === null || workOrder === null ? null : { id, at, type: "work-order", chatId: 0, messageId: null, todoId: item, workOrder };
  }

  if (kind === "talk_moved") {
    const item = number(data.item);

    return item === null ? null : { id, at, type: "todo-talk", chatId: 0, messageId: null, todoId: item };
  }

  if (todoKind(kind)) {
    // An item made or let go changes which rows the board holds, so it names no one item.
    const item = kind === "item.created" || kind === "item.deleted" ? null : itemOf(kind, member);

    return item === null ? { id, at, type: "todo", chatId: 0, messageId: null } : { id, at, type: "todo", chatId: 0, messageId: null, todoId: item };
  }

  if (kind === "work-order.changed" || kind === "task.changed") {
    const item = itemOf(kind, member);

    return item === null ? { id, at, type: "todo", chatId: 0, messageId: null } : { id, at, type: "work-order", chatId: 0, messageId: null, todoId: item };
  }

  if (kind.startsWith("note.") || kind === "report.created") {
    const item = itemOf(kind, member);

    return item === null ? { id, at, type: "todo", chatId: 0, messageId: null } : { id, at, type: "todo-talk", chatId: 0, messageId: null, todoId: item };
  }

  return null;
}

/**
 * One of the agency's events as the console's (the agency's `docs/api.md`, 「Events」): a turn going out or
 * ending as an agent's turn, and a job starting, changing or ending as work running for its room. The event's
 * own kind is the outer `kind`; what it carries is the event's `data`.
 */
export function agencyEvent(data: Fields): BotEvent | null {
  const kind = text(data.kind);
  const id = number(data.id) ?? 0;
  const at = number(data.at) ?? 0;
  const member = fieldsOf(data.data);

  if (kind === null) return null;

  if (kind === "turn.created" || kind === "turn.ended" || kind === "turn-started" || kind === "turn-ended") {
    const turn = member ?? data;
    const session = text(turn.session);
    const run = text(turn.run);

    if (session === null || run === null) return null;

    const phase = kind === "turn.created" || kind === "turn-started" ? "started" : "ended";

    return { id, at: number(turn.at) ?? at, type: "agency-turn", chatId: 0, messageId: null, phase, session, run };
  }

  if (kind === "run.created" || kind === "run.changed" || kind === "run.stopped" || kind === "session.created" || kind === "session.changed") {
    const moved = member ?? data;
    const agent = text(moved.agentName) ?? text(moved.agent);
    const run = kind.startsWith("run.") ? (text(moved.unitName) ?? text(moved.name) ?? text(moved.run)) : text(moved.run);

    return { id, at: number(moved.at) ?? at, type: "agency-run", chatId: 0, messageId: null, agent, run };
  }

  if (kind === "job.created" || kind === "job.changed" || kind === "job.ended") {
    const job = member ?? data;
    const room = number(job.roomId);
    const item = number(job.itemId);

    return { id, at: number(job.startedAt) ?? at, type: "worker-run", chatId: room ?? 0, messageId: null, ...(item === null ? {} : { todoId: item }) };
  }

  if (kind === "supervisor.changed" || kind === "role.changed" || kind === "repository.changed" || kind === "repository.deleted" || kind === "slot-request.changed") {
    return { id, at, type: "agency-catalogue", chatId: 0, messageId: null };
  }

  return null;
}

// A briefing's number, which the engine writes as a number or as its digits; null where it is neither.
function briefingIdOf(value: unknown): number | null {
  const id = number(value) ?? Number(text(value) ?? Number.NaN);

  return Number.isSafeInteger(id) ? id : null;
}

// The engine's stop of a room's briefings, or of every room's where it names none.
function stoppedEvent(data: Fields): BotEvent | null {
  const stop = fieldsOf(data.data);

  if (stop === null) return null;

  const named = stop.chatId ?? null;
  const room = named === null ? null : number(named);

  if (named !== null && room === null) return null;

  const briefingIds = (Array.isArray(stop.briefingIds) ? stop.briefingIds : []).map(briefingIdOf).filter((id) => id !== null);

  return { id: number(data.id) ?? 0, at: number(data.at) ?? 0, type: "voice-briefings-stopped", chatId: 0, messageId: null, stoppedRoom: room, briefingIds };
}

/** One of the voice engine's briefing events as the screens read it (its `docs/boundary-api.md`, 「Events」): what it
 * said of the briefing and the briefing as it stands, or the briefings it stopped; null for any other kind or a
 * briefing that does not read. */
export function voiceEvent(data: Fields): BotEvent | null {
  const kind = text(data.kind);

  if (kind === "briefings.stopped") return stoppedEvent(data);

  const phase = kind === "briefing.created" ? "created" : kind === "briefing.ended" ? "ended" : kind === "briefing.changed" ? "changed" : null;
  const row = fieldsOf(data.data);

  if (phase === null || row === null) return null;

  const id = briefingIdOf(row.id);
  const chatId = number(row.chatId);

  if (id === null || chatId === null) return null;

  const messageId = exactMessageIdOf(row.messageId);
  const voice: VoiceBriefing = {
    id,
    chatId,
    messageId,
    kind: row.kind === "full" ? "full" : "summary",
    title: text(row.title),
    state: briefingStateOf(row.state),
    durationMs: number(row.durationMs),
    plays: row.plays !== false,
    voiceMessageId: exactMessageIdOf(row.voiceMessageId),
    spoken: row.synthesisId !== null && row.synthesisId !== undefined,
    finishedAt: number(row.finishedAt)
  };

  return { id: number(data.id) ?? 0, at: number(data.at) ?? 0, type: "voice-briefing", chatId, messageId, phase, voice };
}
