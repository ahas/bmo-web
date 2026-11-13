import { describe, expect, test } from "bun:test";

// A job standing on a question, where the owner looks (docs/web.md, the job question's section): the badge on its row in
// the TODO panel, and the answering card inside the item. One card, one route.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const panel = await read("app/components/TodoPanel.vue");
const badge = await read("app/components/TodoQuestionBadge.vue");
const item = await read("app/components/TodoItemDetail.vue");
const ask = await read("app/components/QuestionAsk.vue");

describe("a job standing on a question", () => {
  // The badge is a part of its own, which reads the panel's clock itself (docs/web.md, the TODO panel's section).
  test("marks its row in the list and on the board", () => {
    expect(panel).toContain('<TodoQuestionBadge v-if="askedOf.has(item.id)"');
    expect(badge).toContain("data-awaiting-question");
    expect(badge).toContain('$t("todo.label.awaiting_question")');
    expect(badge).toContain('questionState(question, clock.value) === "open"');
  });

  test("stands the one answering card inside the item, not a quiet line", () => {
    expect(item).toContain('<QuestionAsk :only="openedItem.id" />');
    expect(item).toContain("settledQuestionsOf");
    expect(item).toContain('card.state !== "open"');
  });

  test("answers through the card the room's strip answers through, by the one route", () => {
    expect(ask).toContain('$fetch("/api/questions"');
    expect(ask).toContain("questionReply(");
    expect(ask).toContain("const shown = computed");
  });
});
