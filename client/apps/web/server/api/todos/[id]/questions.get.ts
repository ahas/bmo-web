import type { JobQuestion } from "#shared/types";

// The questions one item's job put to the owner that are settled, oldest first, each with the reply that settled it
// (docs/web.md, the TODO modal's questions): his own answer, or the recommendation bmo-job settled it with once its time
// ran out (bmo-job's `docs/api.md`, 「When the due time passes」). The ones still waiting are the console's one reading
// of the open questions, and stand on the card above these.
export default defineEventHandler(async (event): Promise<JobQuestion[]> => {
  await requireUserSession(event);

  const itemId = requireTodoId(event);
  const page = await jobCall(
    job().GET("/questions", { params: { query: { itemId, addressee: "person", state: "answered", limit: 500 } } })
  );

  return await Promise.all(page.items.map(async (question) => consoleQuestion(question, await settlingReply(question.id))));
});
