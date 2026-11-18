import type { JobQuestion } from "#shared/types";

// What the jobs have stopped to ask the owner and still wait on, as bmo-job's fixed API reads them (bmo-job's
// `docs/api.md`, 「Questions and replies」): an open question's words and the answers to choose from, the answer the job
// would take by itself and why, and how long it waits before that recommendation settles it. Only the questions put to
// a person are his: one a job's supervisor holds is the supervisor's to settle, talk over or put to him (bmo-job's
// `docs/api.md`, 「The addressee」), and stands nowhere in the console until it is put to him.
export default defineEventHandler(async (event): Promise<JobQuestion[]> => {
  await requireUserSession(event);

  // A stopped question still waits on him, so it is read with the open ones and stays on its card.
  const pages = await Promise.all(
    (["open", "paused"] as const).map((state) => jobCall(job().GET("/questions", { params: { query: { state, addressee: "person", limit: 500 } } })))
  );

  return pages.flatMap((page) => page.items).map((question) => consoleQuestion(question));
});
