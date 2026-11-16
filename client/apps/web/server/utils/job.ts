import { jobClient } from "bmo-job-client";

import { CONTROL_UNREACHABLE } from "#shared/config";
import { wording } from "#shared/wording";

import { JOB_CODES } from "./job-codes";
import { unitAt } from "./units";
import { answered } from "./unit-answer";

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
type JobQuestionRow =components["schemas"]["Question"];

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
