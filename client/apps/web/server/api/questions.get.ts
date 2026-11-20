import type { JobQuestion } from "#shared/types";

// What the jobs have stopped to ask the owner and still wait on, as bmo-job's fixed API reads them (bmo-job's
// `docs/api.md`, 「Questions and replies」): an open question's words and the answers to choose from, the answer the job
// would take by itself and why, and how long it waits before that recommendation settles it. Only the questions put to
// a person are his, and a stopped one still waits on him, so it stays on its card.
export default defineEventHandler(async (event): Promise<JobQuestion[]> => {
  await requireUserSession(event);

  return (await ownersWaitingQuestions()).map((question) => consoleQuestion(question));
});
