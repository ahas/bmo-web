import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import {
  DUE_READ_DELAY_S,
  dueToRead,
  openQuestions,
  questionCard,
  questionReply,
  questionSendLabel,
  questionsOfTodo,
  questionState,
  questionSummary,
  talkWait
} from "../../../apps/web/app/domain/questions";

import type { JobQuestion } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/questions.test.ko.json";

const askedAt = 1_756_800_000;
const options = [KO.line_18, KO.line_18_2];

function question(over: Partial<JobQuestion> = {}): JobQuestion {
  return {
    id: 1,
    todoId: 12,
    asker: "agent-a",
    question: KO.line_24,
    options,
    recommended: 1,
    recommendation: null,
    why: KO.line_27,
    askedAt,
    dueAt: askedAt + 600,
    chosen: null,
    answer: null,
    pausedLeft: null,
    settledAt: null,
    settledBy: null,
    ...over
  };
}

describe("how a question reads on the screen", () => {
  test("one still waiting says which item asked, how long is left and which choice the job recommends", () => {
    const card = questionCard(wording, question(), askedAt + 60);

    expect(card.state).toBe("open");
    expect(card.answerable).toBe(true);
    expect(card.todoId).toBe(12);
    expect(card.status).toBe(wording("question.status.running", { time: KO.line_46, number: "2" }));
    expect(card.answer).toBeNull();
    expect(card.options).toEqual([
      { number: 1, text: options[0] as string, recommended: false, chosen: false },
      { number: 2, text: options[1] as string, recommended: true, chosen: false }
    ]);
  });

  test("the last minute of the wait is counted in seconds, as the chat's own question is", () => {
    expect(questionCard(wording, question(), askedAt + 570).status).toBe(wording("question.status.running", { time: KO.line_55, number: "2" }));
  });

  // bmo-job settles a question with a recommendation as its time runs out (its `docs/api.md`, 「When the due time
  // passes」); until its news arrives the card says so, and only one with no recommendation waits on a person.
  test("one whose time has run out says its recommendation settles it, and only one with none waits on him", () => {
    const at = askedAt + 600;

    expect(questionState(question())).toBe("open");
    expect(questionCard(wording, question(), at).status).toBe(wording("question.status.overdue", { number: "2" }));
    expect(questionCard(wording, question({ recommended: null, recommendation: KO.line_18 }), at).status).toBe(wording("question.status.overdue_words"));
    expect(questionCard(wording, question({ recommended: null }), at).status).toBe(wording("question.status.overdue_alone"));
  });

  test("one he settled himself says so and carries the option he took", () => {
    const card = questionCard(
      wording,
      question({ chosen: 0, settledAt: askedAt + 30, settledBy: "owner" }),
      askedAt + 60
    );

    expect(card.state).toBe("owner");
    expect(card.answerable).toBe(false);
    expect(card.status).toBe(wording("question.status.owner"));
    expect(card.answer).toBe(options[0] as string);
    expect(card.options[0]?.chosen).toBe(true);
  });

  test("one he answered in words carries his own words and no option of its own", () => {
    const card = questionCard(
      wording,
      question({ answer: KO.line_76, settledAt: askedAt + 30, settledBy: "owner" }),
      askedAt + 60
    );

    expect(card.state).toBe("owner");
    expect(card.answer).toBe(KO.line_81);
    expect(card.options.some((option) => option.chosen)).toBe(false);
  });

  test("one its recommendation settled as its time ran out says so, never that it waits", () => {
    const card = questionCard(
      wording,
      question({ chosen: 1, settledAt: askedAt + 600, settledBy: "recommendation" }),
      askedAt + 700
    );

    expect(card.state).toBe("recommendation");
    expect(card.answerable).toBe(false);
    expect(card.status).toBe(wording("question.status.recommendation"));
    expect(card.answer).toBe(options[1] as string);
  });

});

describe("what the service's recommendation says", () => {
  test("a recommendation on one choice marks only that choice, and its reason stands with it", () => {
    const [card] = questionsOfTodo(wording, [question({ recommended: 1, why: KO.line_27, options: [KO.line_18, KO.line_18_2] })], 12, askedAt + 10);

    expect(card?.options.map((option) => option.recommended)).toEqual([false, true]);
    expect(card?.why).toBe(KO.line_27);
  });

  // A recommendation that is a choice with other words beside it, as a supervisor once marked one, names no choice.
  test("a recommendation that names no choice marks none, and stands on the card in its own words", () => {
    const words = `${KO.line_18} (recommended)`;
    const [card] = questionsOfTodo(wording, [question({ recommended: null, recommendation: words, why: KO.line_27 })], 12, askedAt + 60);

    expect(card?.options.map((option) => option.recommended)).toEqual([false, false]);
    expect(card?.recommendation).toBe(words);
    expect(card?.status).toBe(wording("question.status.running_words", { time: KO.line_46 }));
    expect(questionCard(wording, question({ recommended: null, recommendation: words, pausedLeft: 0 }), askedAt + 60).status).toBe(wording("question.status.paused_words"));
  });
});

describe("which questions the panel puts in front of him", () => {
  const asked = [
    question({ id: 1, chosen: 1, settledAt: askedAt + 30, settledBy: "owner" }),
    question({ id: 2, todoId: 13 }),
    question({ id: 3, dueAt: askedAt + 100 })
  ];

  test("the open ones, the nearest deadline first, and nothing that is already answered", () => {
    // The third has the shorter wait of the two open ones, so it is the one about to be taken
    // out of his hands and it stands ahead of the one that was asked before it.
    expect(openQuestions(wording, asked, askedAt + 60).map((card) => card.id)).toEqual([3, 2]);
    expect(questionSummary(wording, asked, askedAt + 60)).toBe(wording("question.label.summary", { n: "2" }));
  });

  test("a wait that has run out still stands in front of him", () => {
    expect(openQuestions(wording, asked, askedAt + 601).map((card) => card.id)).toEqual([3, 2]);
    expect(questionSummary(wording, asked, askedAt + 601)).toBe(wording("question.label.summary", { n: "2" }));
  });

  test("an item's own questions stay with the item, answered or not", () => {
    expect(questionsOfTodo(wording, asked, 12, askedAt + 60).map((card) => card.id)).toEqual([1, 3]);
    expect(questionsOfTodo(wording, asked, 13, askedAt + 60).map((card) => card.id)).toEqual([2]);
    expect(questionsOfTodo(wording, asked, 99, askedAt + 60)).toEqual([]);
  });
});

// The strip that stands over every screen while a job is waiting. It is on the screen while a job stands still
// behind a question, its time run out or not, and a question that was answered takes it away.
describe("what stands over every screen while a job waits", () => {
  const now = 1_700_000_000;

  function asked(over: Partial<JobQuestion> = {}): JobQuestion {
    return {
      id: 1, todoId: 42, asker: "agent-a", question: KO.line_139,
      options: [KO.line_140, KO.line_140_2], recommended: 1, recommendation: null, why: KO.line_140_3,
      askedAt: now - 60, dueAt: now + 540, chosen: null, answer: null, pausedLeft: null,
      settledAt: null, settledBy: null, ...over
    };
  }

  test("an open question stands, with what is left of its wait beside it", () => {
    const [card] = openQuestions(wording, [asked()], now);

    expect(card?.todoId).toBe(42);
    // Nine minutes left of a long wait, and what the silence would take, which is the whole of what
    // he decides by not answering.
    expect(card?.status).toBe(wording("question.status.running", { time: KO.line_152, number: "2" }));
  });

  test("and the wait reads in seconds at the end, where a minute would round the last of it away", () => {
    expect(openQuestions(wording, [asked({ dueAt: now + 20 })], now)[0]?.status).toBe(wording("question.status.running", { time: KO.line_156, number: "2" }));
  });

  test("a question he answered himself takes it away", () => {
    expect(openQuestions(wording, [asked({ settledAt: now - 5, settledBy: "owner", chosen: 0 })], now)).toEqual([]);
  });

  test("and so does one its recommendation settled as its time ran out", () => {
    expect(openQuestions(wording, [asked({ settledAt: now - 5, settledBy: "recommendation" })], now)).toEqual([]);
  });

  // A question opened again with no time left, as bmo-job opens one stopped after its time ran out, still stands.
  test("but one whose wait ran out stays, ahead of one still counting", () => {
    const counting = asked({ id: 1, todoId: 10, dueAt: now + 50 });
    const over = asked({ id: 2, todoId: 11, dueAt: now });

    expect(openQuestions(wording, [counting, over], now).map((card) => card.todoId)).toEqual([11, 10]);
    expect(openQuestions(wording, [over], now)[0]?.status).toBe(wording("question.status.overdue", { number: "2" }));
  });

  test("a stopped question still stands with no due time, and says it is stopped and what it recommends", () => {
    const [card] = openQuestions(wording, [asked({ dueAt: null, pausedLeft: 0 })], now);

    expect(card?.paused).toBe(true);
    expect(card?.answerable).toBe(true);
    expect(card?.status).toBe(wording("question.status.paused", { number: "2" }));
    expect(questionCard(wording, asked(), now).paused).toBe(false);
  });

  test("and stands behind a question whose minute is still running", () => {
    const stopped = asked({ id: 1, todoId: 10, dueAt: null, pausedLeft: 0 });
    const running = asked({ id: 2, todoId: 11, dueAt: now + 50 });

    expect(openQuestions(wording, [stopped, running], now).map((card) => card.todoId)).toEqual([11, 10]);
  });

  test("one with no due time counts nothing, offers no stop, never says its time ran out, and stands behind a running minute", () => {
    const untimed = asked({ id: 1, todoId: 10, dueAt: null });
    const running = asked({ id: 2, todoId: 11, dueAt: now + 50 });
    const cards = openQuestions(wording, [untimed, running], now);

    expect(cards.map((card) => card.todoId)).toEqual([11, 10]);
    expect(cards[1]?.status).toBe(wording("question.status.untimed"));
    expect(cards.map((card) => card.timed)).toEqual([true, false]);
    expect(questionCard(wording, asked({ dueAt: null, pausedLeft: 0 }), now).timed).toBe(true);
  });

  test("the nearest deadline stands first, whatever order the list was read in", () => {
    const older = asked({ id: 1, todoId: 10, askedAt: now - 300, dueAt: now + 300 });
    const newer = asked({ id: 2, todoId: 11, askedAt: now - 30, dueAt: now + 570 });

    expect(openQuestions(wording, [newer, older], now).map((card) => card.todoId)).toEqual([10, 11]);
  });
});

// A job is standing still behind an open question and what goes out cannot be taken back: the bot
// writes the row once and refuses a second answer. So pressing an option sets it and sends
// nothing, and one more press — the one that names what it is about to send — is what sends.
describe("what a press on a question would send", () => {
  test("nothing at all until one of the two is set", () => {
    expect(questionReply(null, "")).toBeNull();
    expect(questionReply(null, "   ")).toBeNull();
  });

  test("the option's own number where one is chosen", () => {
    expect(questionReply(0, "")).toEqual({ chosen: 0 });
    expect(questionReply(1, "")).toEqual({ chosen: 1 });
  });

  test("his own words where he wrote them, trimmed to what he meant", () => {
    expect(questionReply(null, KO.line_213)).toEqual({ answer: KO.line_213_2 });
  });

  // The bot refuses a body carrying both, so the two are never sent together: a chosen option
  // wins, and the screen is what keeps the other from being set at the same time.
  test("one of the two and never both at once", () => {
    expect(questionReply(1, KO.line_219)).toEqual({ chosen: 1 });
  });

  // The label names what is about to go rather than the act, so the press is never a step into
  // the dark: the number he is sending is on the button before he presses it.
  test("and the button says which of them it is about to send", () => {
    expect(questionSendLabel(wording, 0, "")).toBe(wording("question.action.answer_with", { number: "1" }));
    expect(questionSendLabel(wording, 2, "")).toBe(wording("question.action.answer_with", { number: "3" }));
    expect(questionSendLabel(wording, null, KO.line_227)).toBe(wording("question.action.answer_as_written"));
    expect(questionSendLabel(wording, null, "")).toBe(wording("question.action.answer"));
    expect(questionSendLabel(wording, null, "   ")).toBe(wording("question.action.answer"));
  });
});

// The reading itself lives in the component the browser runs; what is held here is that it still
// asks before it sends, that a press on an option is not the press that sends, and — the whole of
// what moving it was for — that there is one place it stands and one place only.
const ask = await Bun.file(new URL("../../../apps/web/app/components/QuestionAsk.vue", import.meta.url)).text();
// The queue, with the dialog its open row is read in.
const panel = (await Bun.file(new URL("../../../apps/web/app/components/TodoPanel.vue", import.meta.url)).text())
  + (await Bun.file(new URL("../../../apps/web/app/components/TodoItemDetail.vue", import.meta.url)).text());

const bar = await Bun.file(new URL("../../../apps/web/app/components/QuestionBar.vue", import.meta.url)).text();

describe("where a question is answered", () => {
  test("there is a card to read at all, so nothing below passes on an empty string", () => {
    expect(ask).toContain("card.options");
    expect(ask).toContain("ANSWER_LIMIT");
    expect(ask).toContain("useOpenQuestions");
  });


  // Two places to answer from would be two rows to keep true about one question. The queue keeps
  // the record of what each question became; it offers no way to settle one.
  test("and nowhere else: the queue beside it reads them and cannot answer them", () => {
    expect(panel).not.toContain("card.options");
    expect(panel).not.toContain("/api/questions");
    expect(panel).not.toContain("questionReply");
    // What it keeps is the record: which question, how it stands, what it was settled on.
    expect(panel).toContain("todo.title.questions");
    expect(panel).toContain("card.answer");
  });

  // The strip stands over every screen so that a question is never missed; what it is for is
  // getting him to the one place the answering is done.
  test("and the strip over every screen leads to that one place", () => {
    expect(bar).toContain(":to=\"where\"");
    expect(ask.includes("roomRoute")).toBe(false);
  });

  // The strip states and is not pressed: the way there is the library's button at its end, so a hover
  // colours that button's own shape and never paints the strip edge to edge.
  test("by the button at its end alone, so a hover never paints the strip", () => {
    const strip = bar.slice(0, bar.indexOf("<script"));

    expect(strip).not.toContain("<NuxtLink");
    expect(strip).not.toContain("hover:");
    expect(strip).toMatch(/<UButton :to="where" [^>]*:label="\$t\('common\.action\.open'\)"/);
  });
});

describe("what an option button does", () => {
  // The whole of the item before this one: the press that chooses is not the press that sends.
  test("chooses rather than sends, and shows that it is chosen", () => {
    expect(ask).toContain("@click=\"choose(card, option.number - 1)\"");
    expect(ask).not.toContain("@click=\"pick(card, option.number - 1)\"");
    expect(ask).toContain("picked[card.id] === option.number - 1 ? 'solid' : 'subtle'");
    expect(ask).toContain("aria-pressed");
  });

  test("and one button below sends whichever of the two is set, named", () => {
    expect(ask).toContain("sendLabel(card)");
    expect(ask).toContain("@click=\"send(card)\"");
    expect(ask).toContain("questionReply(picked[card.id] ?? null, words[card.id] ?? '') === null");
  });

  test("with a way to take a wrong press back", () => {
    expect(ask).toContain("$t('question.action.unpick')");
    expect(ask).toContain("@click=\"unpick(card)\"");
  });
});

// Where the talk over a question stands for the person talking (docs/web.md, 「Talking a question over」): the job
// writing its answer once it was handed the last word said to it, not yet handed it before that, and nothing to wait
// for once the job spoke last or the question no longer waits.
describe("the talk over a question", () => {
  const said = (id: number, byAsker: boolean) => ({ id, byAsker, name: byAsker ? "agent-a" : "agent-b", text: "words", at: 0 });

  test("waits on nothing while nothing was said or the job spoke last", () => {
    expect(talkWait({ turns: [], heardThrough: null, open: true })).toBeNull();
    expect(talkWait({ turns: [said(1, false), said(2, true)], heardThrough: 1, open: true })).toBeNull();
  });

  test("is the job writing once it was handed the last word, and unheard before", () => {
    expect(talkWait({ turns: [said(1, false)], heardThrough: null, open: true })).toBe("unheard");
    expect(talkWait({ turns: [said(1, false), said(2, true), said(3, false)], heardThrough: 1, open: true })).toBe("unheard");
    expect(talkWait({ turns: [said(1, false), said(2, true), said(3, false)], heardThrough: 3, open: true })).toBe("writing");
  });

  test("waits on nothing once the question no longer waits", () => {
    expect(talkWait({ turns: [said(1, false)], heardThrough: 1, open: false })).toBeNull();
  });
});

// bmo-job settles a question on its recommendation within a second of its due time; the console reads the questions
// again a moment after the countdown reaches nothing, so the card leaves on that settling even where the news is lost.
describe("reading again as a countdown runs out", () => {
  const due = askedAt + 600;

  test("not before the moment after the due time", () => {
    expect(dueToRead([question({ dueAt: due })], due + DUE_READ_DELAY_S - 1, 0)).toBeNull();
  });

  test("once that moment has come, and once only for that due time", () => {
    expect(dueToRead([question({ dueAt: due })], due + DUE_READ_DELAY_S, 0)).toBe(due);
    expect(dueToRead([question({ dueAt: due })], due + 60, due)).toBeNull();
  });

  test("never for a stopped question, one with no due time, or one already settled", () => {
    const later = due + 60;
    const untouched = [
      question({ id: 1, dueAt: null, pausedLeft: 0 }),
      question({ id: 2, dueAt: null }),
      question({ id: 3, dueAt: due, settledAt: due, settledBy: "recommendation" })
    ];

    expect(dueToRead(untouched, later, 0)).toBeNull();
  });
});
