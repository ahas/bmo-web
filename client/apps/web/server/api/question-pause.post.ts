import { wording } from "#shared/wording";

import { signedInUser } from "../utils/accounts";
import { isOwnerLogin } from "../utils/owner";

import type { QuestionPauseResult } from "#shared/types";

interface PauseBody {
  id?: unknown;
  paused?: unknown;
}

// Stopping a question's clock while he reads it, or starting it again. The row is bmo-job's to write, as the
// answer is: its fixed API moves a question between open and paused, and the time it settles by comes back with it.
export default defineEventHandler(async (event): Promise<QuestionPauseResult> => {
  await requireUserSession(event);

  // Stopping the clock of a question put to the owner is his to do alone.
  if (!(await isOwnerLogin(await signedInUser(event)))) throw fail(403, wording("question.error.owner_only"));

  const body = await readBody<PauseBody>(event);
  const id = body?.id;

  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw fail(400, wording("question.error.bad_question_id"));
  }

  if (typeof body?.paused !== "boolean") {
    throw fail(400, wording("question.error.pause_direction"));
  }

  await ownersQuestion(id);

  const question = await jobCall(job().PATCH("/questions/{questionId}", {
    params: { path: { questionId: id } },
    body: { state: body.paused ? "paused" : "open" }
  }));

  return {
    ok: true,
    pausedLeft: null,
    dueAt: question.dueAt === null ? 0 : Math.floor(question.dueAt / 1000)
  };
});
