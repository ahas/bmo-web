import { jobClient } from "bmo-job-client";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { JOB_CODES } from "./job-codes";
import { unitAt } from "./units";
import { answered } from "./unit-answer";

import type { JobQuestion } from "#shared/types";
import type { Client } from "openapi-fetch";
import type { components, paths } from "bmo-job-client/schema";
import type { UnitAnswerCall } from "./unit-answer";

// bmo-job's fixed API as its published package states it (bmo-job's `docs/api.md`): one document, its types in
// `bmo-job-client/schema`, and one call for each route over them. A refusal is answered with its code and an
// English sentence, which the console says by the pack's sentence for the code.

/** The job service's client, over the document its package publishes. */
export type JobClient = Client<paths>;

/** bmo-job at the address its setting names, asked with its token. */
export function job(): JobClient {
  const unit = unitAt("JOB");

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  return jobClient(unit.address, unit.token ?? "");
}

/** One call on bmo-job, its refusals said in the pack's words. */
export async function jobCall<T, E extends { code?: string; error?: string; field?: string }>(
  asked: Promise<{ data?: T; error?: E; response: Response }>,
  call: UnitAnswerCall = {}
): Promise<T> {
  return await answered(asked, { ...call, codes: JOB_CODES });
}

/** One of bmo-job's questions, as its fixed API reads it. */
type JobQuestionRow = components["schemas"]["Question"];

/**
 * A question the owner answers, talks over or stops the clock of, read from bmo-job. A question a job's supervisor
 * holds is the supervisor's until it puts it to a person (bmo-job's `docs/api.md`, 「The addressee」), and the
 * console stands it nowhere, so it is refused here as nothing he may act on.
 */
export async function ownersQuestion(id: number): Promise<JobQuestionRow> {
  const question = await jobCall(job().GET("/questions/{questionId}", { params: { path: { questionId: id } } }));

  if (question.addressee !== "person") throw fail(409, wording("question.error.not_put_to_owner"));

  return question;
}

/**
 * The questions still waiting on the owner, as bmo-job holds them: those put to a person, open or stopped, since a
 * stopped one still waits on him. One a job's supervisor holds is the supervisor's to settle, talk over or put to him
 * (bmo-job's `docs/api.md`, 「The addressee」), and is none of them until it is put to him.
 */
export async function ownersWaitingQuestions(): Promise<JobQuestionRow[]> {
  const pages = await Promise.all(
    (["open", "paused"] as const).map((state) => jobCall(job().GET("/questions", { params: { query: { state, addressee: "person", limit: 500 } } })))
  );

  return pages.flatMap((page) => page.items);
}

/** One of bmo-job's replies to a question, as its fixed API reads it. */
type JobReplyRow = components["schemas"]["Reply"];

// The most bmo-job hands in one page of a question's replies.
const REPLY_PAGE = 500;

/** The reply that settled a question, or null where none has. */
export async function settlingReply(id: number): Promise<JobReplyRow | null> {
  let after: number | undefined;

  for (;;) {
    const page = await jobCall(
      job().GET("/questions/{questionId}/replies", { params: { path: { questionId: id }, query: { after, limit: REPLY_PAGE } } })
    );
    const settling = page.items.find((reply) => reply.settles);
    const last = page.items.at(-1);

    if (settling !== undefined) return settling;
    if (!page.more || last === undefined) return null;

    after = last.id;
  }
}

/**
 * One of bmo-job's questions put to the owner as the console reads it (bmo-job's `docs/api.md`, 「Questions and
 * replies」), with the reply that settled it where one did. The recommendation marks the choice it names word for
 * word, and stands as its own words where it names none, since bmo-job refuses one that is a choice with other words
 * beside it (「The recommendation」); nothing is guessed. A settling reply whose source is the recommendation is the
 * question's time running out on it (「When the due time passes」).
 */
export function consoleQuestion(question: JobQuestionRow, settling: JobReplyRow | null = null): JobQuestion {
  const named = question.recommendation?.answer ?? null;
  const at = named === null ? -1 : question.choices.indexOf(named);
  const chosen = settling?.choice === null || settling?.choice === undefined ? -1 : question.choices.indexOf(settling.choice);

  return {
    id: question.id,
    todoId: question.itemId ?? 0,
    asker: question.askerName,
    question: question.text,
    options: question.choices,
    recommended: at === -1 ? null : at,
    recommendation: named !== null && at === -1 ? named : null,
    why: question.recommendation?.why ?? "",
    askedAt: Math.floor(question.createdAt / 1000),
    // Rounded up, so the countdown never reaches nothing before bmo-job's own due time does.
    dueAt: question.dueAt === null ? null : Math.ceil(question.dueAt / 1000),
    chosen: chosen === -1 ? null : chosen,
    answer: settling === null || chosen !== -1 ? null : settling.text,
    // bmo-job keeps a stopped question's time left to itself and reads no due time while it stands stopped.
    pausedLeft: question.state === "paused" ? 0 : null,
    settledAt: settling === null ? null : Math.floor(settling.createdAt / 1000),
    settledBy: settling === null ? null : settling.source === "recommendation" ? "recommendation" : "owner"
  };
}

/** What came of telling the agent how the queue stands, by its kind (bmo-job's `docs/api.md`, 「A queue told」). */
export type QueueTold = string;

const QUEUE_TOLD: Readonly<Record<QueueTold, string>> = {
  told: "todo.message.queue_told",
  nothing_waiting: "todo.message.queue_nothing_waiting",
  all_busy: "todo.message.queue_all_busy",
  paused: "todo.message.queue_paused",
  unreadable: "todo.message.queue_unreadable",
  machine_short: "todo.message.queue_machine_short",
  unchanged: "todo.message.queue_unchanged"
};

/** What came of telling the queue, in the pack's words, or null where nothing was told. */
export function queueToldText(told: QueueTold | null | undefined): string | null {
  if (told === null || told === undefined) return null;

  const key = QUEUE_TOLD[told];

  return key === undefined ? told : wording(key);
}
