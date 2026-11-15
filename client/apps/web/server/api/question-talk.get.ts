import { wording } from "#shared/wording";

import type { QuestionTalk, QuestionTalkTurn } from "#shared/types";

// The most bmo-job hands in one page of replies; a talk longer than that is read page by page.
const PAGE = 500;

// The talk over one of a job's questions (docs/web.md, 「Talking a question over」): the question's replies that
// settle nothing, in the order they were said, each with whether the job that asked said it, and how far that job
// has heard them. bmo-job keeps all of it with the question (its `docs/api.md`, 「Questions and replies」).
export default defineEventHandler(async (event): Promise<QuestionTalk> => {
  await requireUserSession(event);

  const id = Number(getQuery(event).id);

  if (!Number.isSafeInteger(id)) {
    throw fail(400, wording("question.error.bad_question_id"));
  }

  const question = await jobCall(job().GET("/questions/{questionId}", { params: { path: { questionId: id } } }));
  const turns: QuestionTalkTurn[] = [];
  let after: number | undefined;

  for (;;) {
    const page = await jobCall(
      job().GET("/questions/{questionId}/replies", { params: { path: { questionId: id }, query: { after, limit: PAGE } } })
    );

    for (const reply of page.items) {
      if (!reply.settles) {
        turns.push({ id: reply.id, byAsker: reply.actorName === question.askerName, name: reply.actorName, text: reply.text, at: reply.createdAt });
      }
    }

    const last = page.items.at(-1);

    if (!page.more || last === undefined) break;

    after = last.id;
  }

  return { turns, heardThrough: question.heardThrough, open: question.state === "open" || question.state === "paused" };
});
