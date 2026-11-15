import type { JobQuestion } from "#shared/types";

// What the jobs have stopped to ask the owner, as bmo-job's fixed API reads them (bmo-job's `docs/api.md`,
// 「Questions」): an open question's words and the answers to choose from, the answer the job would take by itself and
// why (its recommendation names a choice, or stands as words the choices do not hold), and how long it waits before it
// settles on that recommendation.
export default defineEventHandler(async (event): Promise<JobQuestion[]> => {
  await requireUserSession(event);

  // A stopped question still waits on him, so it is read with the open ones and stays on its card.
  const pages = await Promise.all(
    (["open", "paused"] as const).map((state) => jobCall(job().GET("/questions", { params: { query: { state, limit: 500 } } })))
  );

  return pages.flatMap((page) => page.items).map((question) => {
    const named = question.recommendation?.answer?.trim() ?? null;
    const at = named === null ? -1 : question.choices.findIndex((choice) => choice.trim() === named);

    return {
      id: question.id,
      todoId: question.itemId ?? 0,
      asker: question.askerName,
      question: question.text,
      options: question.choices,
      // The mark stands on the choice the recommendation names, and nowhere where it names none.
      recommended: at === -1 ? null : at,
      recommendation: named !== null && at === -1 ? named : null,
      why: question.recommendation?.why ?? "",
      askedAt: Math.floor(question.createdAt / 1000),
      dueAt: question.dueAt === null ? 0 : Math.floor(question.dueAt / 1000),
      chosen: null,
      answer: null,
      // bmo-job keeps a stopped question's time left to itself and reads no due time while it stands stopped.
      pausedLeft: question.state === "paused" ? 0 : null,
      settledAt: null,
      settledBy: null
    };
  });
});
