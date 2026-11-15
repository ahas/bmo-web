import { ANSWER_LIMIT } from "#shared/config";
import { wording } from "#shared/wording";

import { signedInUser } from "../utils/accounts";
import { isOwnerLogin } from "../utils/owner";

import type { QuestionAnswerResult } from "#shared/types";

interface AnswerBody {
  id?: unknown;
  chosen?: unknown;
  answer?: unknown;
}

// Answering a question a job put to the owner, by the owner's login alone. The row is bmo-job's to write, and its own conditional write
// decides it: an answer that arrives after the chat's or the deadline's changes nothing and is refused 409. The
// fixed API takes a reply with the choice it names and the words beside it.
export default defineEventHandler(async (event): Promise<QuestionAnswerResult> => {
  const signed = await signedInUser(event);

  // A job's question is put to the owner, and the job takes every word on it as his (bmo-job's `docs/cli.md`,
  // 「`bmo-job job ask`」), so only the owner's login answers it (docs/web.md, 「Access」).
  if (!(await isOwnerLogin(signed))) throw fail(403, wording("question.error.owner_only"));

  const body = await readBody<AnswerBody>(event);
  const id = body?.id;
  const chosen = body?.chosen;
  const answer = body?.answer;

  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw fail(400, wording("question.error.bad_question_id"));
  }

  // One or the other: a body carrying both says two things, and neither of them is his answer.
  if ((chosen === undefined) === (answer === undefined)) {
    throw fail(400, wording("question.error.one_answer"));
  }

  if (chosen !== undefined && (typeof chosen !== "number" || !Number.isInteger(chosen) || chosen < 0)) {
    throw fail(400, wording("question.error.bad_option"));
  }

  if (answer !== undefined && (typeof answer !== "string" || answer.trim() === "" || answer.length > ANSWER_LIMIT)) {
    throw fail(400, wording("question.error.bad_own_answer"));
  }

  const question = await jobCall(job().GET("/questions/{questionId}", { params: { path: { questionId: id } } }));
  const option = typeof chosen === "number" ? question.choices[chosen] : undefined;
  const text = typeof answer === "string" ? answer.trim() : (option ?? "");

  if (text === "") throw fail(400, wording("question.error.bad_option"));

  await jobCall(job().POST("/questions/{questionId}/replies", {
    params: { path: { questionId: id } },
    body: { text, actorName: signed.name, choice: option ?? null, settles: true }
  }));

  return { ok: true };
});
