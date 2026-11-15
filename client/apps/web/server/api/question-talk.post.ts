import { TALK_LIMIT } from "#shared/config";
import { wording } from "#shared/wording";

import { signedInUser } from "../utils/accounts";
import { isOwnerLogin } from "../utils/owner";

import type { QuestionTalkResult } from "#shared/types";

interface TalkBody {
  id?: unknown;
  say?: unknown;
}

// A word on one of a job's questions, said to the job that asked (docs/web.md, 「Talking a question over」). bmo-job
// keeps it as a reply that settles nothing, and the run waiting on the question is handed it and answers on the same
// question (bmo-job's `docs/cli.md`, 「`bmo-job job ask`」). A word stops the question's clock as a word in the chat
// does, so the talk is not overtaken by its due time; the question stays open, and only a settling reply answers it.
export default defineEventHandler(async (event): Promise<QuestionTalkResult> => {
  const signed = await signedInUser(event);

  // The job that asked takes every word on its question as the owner's, so only the owner's login talks it over.
  if (!(await isOwnerLogin(signed))) throw fail(403, wording("question.error.owner_only"));

  const body = await readBody<TalkBody>(event);
  const id = body?.id;
  const say = typeof body?.say === "string" ? body.say.trim() : "";

  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw fail(400, wording("question.error.bad_question_id"));
  }

  if (say === "" || say.length > TALK_LIMIT) {
    throw fail(400, wording("question.error.bad_talk"));
  }

  const question = await jobCall(job().GET("/questions/{questionId}", { params: { path: { questionId: id } } }));

  // A question already answered or taken back has nobody waiting on it to hear the word.
  if (question.state !== "open" && question.state !== "paused") {
    throw fail(409, wording("question.error.talk_settled"));
  }

  if (question.state === "open") {
    await jobCall(job().PATCH("/questions/{questionId}", { params: { path: { questionId: id } }, body: { state: "paused" } }));
  }

  await jobCall(job().POST("/questions/{questionId}/replies", {
    params: { path: { questionId: id } },
    body: { text: say, actorName: signed.name, choice: null, settles: false }
  }));

  return { ok: true };
});
