import { describe, expect, test } from "bun:test";

// A job standing on a question, where the owner looks (docs/web.md, the job question's section): the badge on its row in
// the TODO panel, and the answering card inside the item. One card, one route.

const read = async (path: string) => await Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const row = await read("app/components/TodoRow.vue");
const badge = await read("app/components/TodoQuestionBadge.vue");
const item = await read("app/components/TodoItemDetail.vue");
const ask = await read("app/components/QuestionAsk.vue");
const room = await read("app/pages/rooms/[chatId].vue");
const window = await read("app/components/QuestionWindow.vue");

describe("a job standing on a question", () => {
  // The badge is a part of its own, which reads the panel's clock itself (docs/web.md, the TODO panel's section).
  test("marks its row in the list and on the board", () => {
    expect(row).toContain('<TodoQuestionBadge v-if="questions !== null" :questions="questions" />');
    expect(badge).toContain("data-awaiting-question");
    expect(badge).toContain('$t("todo.label.awaiting_question")');
    expect(badge).toContain('questionState(question, clock.value) === "open"');
  });

  test("stands the one answering card inside the item, not a quiet line", () => {
    expect(item).toContain('<QuestionAsk :only="openedItem.id" />');
    expect(item).toContain("settledQuestionsOf");
    expect(item).toContain('card.state !== "open"');
  });

  // The questions stand in a window over the owner's room rather than in its foot (docs/web.md, 「The questions
  // window」), the same cards in it as one list.
  test("stand in the questions window over the owner's room, out of the room's foot", () => {
    expect(room).toContain('<QuestionWindow v-if="ownsTodo"');
    expect(room).not.toContain("<QuestionAsk");
    expect(window).toContain("<FloatingWindow");
    expect(window).toContain("<QuestionAsk listed");
  });

  // Each question is talked over with the job that asked it, inside its own card (docs/web.md, 「Talking a question
  // over」).
  test("open the talk over a question inside its card", () => {
    expect(ask).toContain("<QuestionTalk");
    expect(ask).toContain('$t(\'question.action.discuss\')');
  });

  test("answers through the card the questions window answers through, by the one route", () => {
    expect(ask).toContain('$fetch("/api/questions"');
    expect(ask).toContain("questionReply(");
    expect(ask).toContain("const shown = computed");
  });
});
