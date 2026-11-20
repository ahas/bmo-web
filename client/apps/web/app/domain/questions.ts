import { POLL_INTERVAL_MS, questionAnswerText } from "#shared/config";
import { roomRoute } from "#shared/paths";
import { useLiveRefresh } from "./events";
import { sameKept } from "./same-kept";
import { elapsedText, toUnixSeconds } from "bmo-ui/app/domain/time";

import type { OwnerChat, JobQuestion, QuestionTalk } from "#shared/types";
import type { Translate } from "#shared/wording";

// How one question reads at a glance: still waiting on him, settled by him, or settled on its recommendation once
// its time ran out with no answer (bmo-job's `docs/api.md`, 「When the due time passes」).
export type QuestionState = "open" | "owner" | "recommendation";

// One of a question's options as the panel offers it: the number the chat also shows, the
// option's own words, whether the job recommends it, and whether it is what the question was
// settled on.
export interface QuestionOption {
  number: number;
  text: string;
  recommended: boolean;
  chosen: boolean;
}

// One question, shaped for the screen. Everything the owner needs to answer it without opening
// anything else: what was asked, which item asked it, why the job would not decide it, what the
// choices are, and how long he has.
export interface QuestionCard {
  id: number;
  todoId: number;
  // Who asked and how long ago, in one line under the job and item that asked.
  asked: string;
  question: string;
  why: string;
  // The answer the job recommends where it names no choice, in its own words; null where it names one, or none.
  recommendation: string | null;
  options: QuestionOption[];
  state: QuestionState;
  // The one line beside the question: how long is left while it is open, and who settled it and
  // how once it is not.
  status: string;
  // What it was settled on, in the words the job read. Null while it is still open.
  answer: string | null;
  // Whether answering it now would reach anybody. Only an open question does.
  answerable: boolean;
  // Whether this question's clock stands stopped in bmo-job. A stop is the one question's: the console keeps none of
  // its own, so a card says only what the job service holds for its own row.
  paused: boolean;
  // Whether it has a clock at all, running or stopped. One with no due time has nothing to stop, so it offers no stop.
  timed: boolean;
}

// What the panel calls each state, in the words the item's own printout uses.
const STATE_LABELS: Record<QuestionState, string> = {
  open: "question.status.open",
  owner: "question.status.owner",
  recommendation: "question.status.recommendation"
};

export function questionState(question: JobQuestion): QuestionState {
  if (question.settledAt === null) return "open";

  return question.settledBy === "recommendation" ? "recommendation" : "owner";
}

export function questionCard(t: Translate, question: JobQuestion, now: number = toUnixSeconds(Date.now())): QuestionCard {
  const state = questionState(question);
  const settled = state === "open" ? null : questionAnswerText(question);

  return {
    id: question.id,
    todoId: question.todoId,
    asked: t("question.label.asked_by", { asker: question.asker, since: elapsedText(t, now - question.askedAt) }),
    question: question.question,
    why: question.why,
    recommendation: question.recommendation,
    options: question.options.map((text, index) => ({
      number: index + 1,
      text,
      recommended: index === question.recommended,
      chosen: question.answer === null && question.chosen === index
    })),
    state,
    status: statusLine(t, question, state, now),
    answer: settled,
    answerable: state === "open",
    paused: question.pausedLeft !== null,
    timed: question.pausedLeft !== null || question.dueAt !== null
  };
}

// The questions still waiting on him, the one longest past its time or nearest it first. A job is standing still
// behind each one, and the order that matters is which has waited on him longest against its own wait — it is
// sorted here rather than left to the order they arrived in, because the strip over every screen carries the first
// of them and that choice has to be the urgent one however the list was read. A stopped question, and one with no due
// time, waits however long he takes, so it stands behind every running minute.
export function openQuestions(t: Translate, questions: JobQuestion[], now: number = toUnixSeconds(Date.now())): QuestionCard[] {
  const stopped = (question: JobQuestion): number => Number(question.pausedLeft !== null);
  const due = (question: JobQuestion): number => question.dueAt ?? Number.POSITIVE_INFINITY;

  return questions
    .filter((question) => questionState(question) === "open")
    .sort((left, right) => stopped(left) - stopped(right) || due(left) - due(right) || left.id - right.id)
    .map((question) => questionCard(t, question, now));
}

// How long after a countdown reaches nothing the questions are read again: bmo-job looks for questions past their due
// time every second, so by then the one whose time ran out reads as settled on its recommendation.
export const DUE_READ_DELAY_S = 2;

// The due time the questions are next read again for, once the clock has passed it by the delay: the latest due time
// of an open, counting question that has passed by then and is later than the one last read for. Null where there is
// none, so a due time is read for once, and the poll and bmo-job's news carry on from there.
export function dueToRead(questions: JobQuestion[], now: number, readThrough: number): number | null {
  const passed = questions
    .filter((question) => questionState(question) === "open" && question.pausedLeft === null)
    .map((question) => question.dueAt)
    .filter((due): due is number => due !== null && due > readThrough && due + DUE_READ_DELAY_S <= now);

  return passed.length === 0 ? null : Math.max(...passed);
}

// What one item's work stopped to ask, oldest first, whether it is answered or not.
export function questionsOfTodo(
  t: Translate,
  questions: JobQuestion[],
  todoId: number,
  now: number = toUnixSeconds(Date.now())
): QuestionCard[] {
  return questions.filter((question) => question.todoId === todoId).map((question) => questionCard(t, question, now));
}

// What the panel's head says when a job is waiting on him, or null when none is. It stands
// beside the queue's own count, and it is what a folded panel shows too.
export function questionSummary(t: Translate, questions: JobQuestion[], now: number = toUnixSeconds(Date.now())): string | null {
  const open = openQuestions(t, questions, now).length;

  return open === 0 ? null : t("question.label.summary", { n: open });
}

// What the job recommends, as the line beside a question names it: the choice by its number, words the choices do
// not hold, or nothing, where only a person's answer settles it.
type Recommends = { number: number } | "words" | null;

function recommends(question: JobQuestion): Recommends {
  if (question.recommended !== null) return { number: question.recommended + 1 };

  return question.recommendation === null ? null : "words";
}

// The line beside the question. An open one says where its clock stands (stopped, counting down, run out, or none
// at all) and what its silence settles: the recommendation, by its choice's number or as words, or nothing, where a
// person is waited for. Run out with a recommendation, it says the recommendation settles it, which bmo-job is about
// to do. With no due time nothing settles it but him, so it says only that.
function statusLine(t: Translate, question: JobQuestion, state: QuestionState, now: number): string {
  if (state !== "open") return t(STATE_LABELS[state]);

  const recommended = recommends(question);

  if (question.pausedLeft !== null) {
    if (recommended === null) return t("question.status.paused_alone");

    return recommended === "words" ? t("question.status.paused_words") : t("question.status.paused", recommended);
  }

  if (question.dueAt === null) return t("question.status.untimed");

  if (question.dueAt <= now) {
    if (recommended === null) return t("question.status.overdue_alone");

    return recommended === "words" ? t("question.status.overdue_words") : t("question.status.overdue", recommended);
  }

  const time = remainingLabel(t, question.dueAt - now);

  if (recommended === null) return t("question.status.running_alone", { time });

  return recommended === "words"
    ? t("question.status.running_words", { time })
    : t("question.status.running", { time, ...recommended });
}

// How long is left, in the units the chat's own question uses: minutes while there are any,
// seconds at the end.
function remainingLabel(t: Translate, seconds: number): string {
  return seconds >= 60 ? t("common.label.minutes", { m: Math.ceil(seconds / 60) }) : t("common.label.seconds", { n: seconds });
}

// How often the countdown is redrawn. It is a clock and nothing else: what the questions say is
// read when the bot says one was asked or settled.
const TICK_MS = 1_000;

// What the whole console knows about the jobs' questions. One read and one clock serve every
// screen: the strip that stands over all of them and the panel that answers them are looking at
// the same list, so they cannot disagree about whether a job is still waiting.
export interface OpenQuestions {
  all: Ref<JobQuestion[]>;
  open: ComputedRef<QuestionCard[]>;
  // Where the answering is done, for the row that is waiting longest, or nothing where none is.
  where: ComputedRef<string | null>;
  reload: () => Promise<void>;
}

interface QuestionsState {
  all: Ref<JobQuestion[]>;
  now: Ref<number>;
  ownerChatId: Ref<number | null>;
}

let state: QuestionsState | null = null;

export function useOpenQuestions(t: Translate): OpenQuestions {
  const held = hold();
  const open = computed(() => openQuestions(t, held.all.value, held.now.value));

  // Each caller listens for itself. The listening is what dies with a screen that goes, so the
  // strip over every screen keeps hearing after a page under it has been replaced; the reading
  // it asks for is shared, so two callers hearing the same news still make one request.
  useLiveRefresh(() => void reload(), { on: ["todo"], everyMs: POLL_INTERVAL_MS });

  return {
    all: held.all,
    open,
    // Where the answering is done: his own room, where the card stands over the box he types in.
    // One place, reached the same way however the question was noticed — this strip, a
    // notification, or simply being there.
    where: computed(() => {
      const chatId = held.ownerChatId.value;

      return open.value.length === 0 || chatId === null ? null : roomRoute(chatId);
    }),
    reload,
  };
}

// One reading, however many are asking for it. A read already on its way is joined rather than
// started again: the strip and the panel hear the same word from the bot at the same moment, and
// two requests for one answer would be two chances to disagree as well as one wasted call.
let reading: Promise<void> | null = null;

async function reload(): Promise<void> {
  reading ??= read().finally(() => {
    reading = null;
  });

  return reading;
}

async function read(): Promise<void> {
  const held = hold();

  held.now.value = toUnixSeconds(Date.now());

  try {
    // A read that brought the questions back as they were hands the screens nothing new to draw.
    held.all.value = sameKept(held.all.value, await $fetch<JobQuestion[]>("/api/questions"));
  } catch {
    // Nothing is said about a read that failed: the next word from the bot asks again, and what
    // is on the screen is still the last thing the archive said.
  }
}

// The one state, made on the first screen that asks for it and kept for the rest. The clock and
// the reading are set up once here rather than by each caller, so a second caller costs nothing
// and cannot start a second poll.
function hold(): QuestionsState {
  if (state !== null) {
    return state;
  }

  const made: QuestionsState = {
    all: ref<JobQuestion[]>([]),
    now: ref(toUnixSeconds(Date.now())),
    ownerChatId: ref<number | null>(null),
  };

  state = made;

  if (import.meta.client) {
    void reload();
    void $fetch<OwnerChat>("/api/owner")
      .then((owner) => {
        made.ownerChatId.value = owner.chatId;
      })
      .catch(() => {
        // Without it the strip still says a job is waiting; only the way to it goes missing.
      });

    // The clock is not tied to whichever screen asked first. What it drives — a countdown on a
    // question the whole console is waiting on — outlives every screen, and a clock cleared when
    // one page was replaced would leave the strip over the next one frozen.
    // A countdown that reached nothing is read again a moment later, so the question bmo-job has just settled on its
    // recommendation leaves even where its news is lost (docs/web.md, 「Its time running out settles it on the
    // recommendation」).
    let readThrough = 0;

    setInterval(() => {
      made.now.value = toUnixSeconds(Date.now());

      const due = dueToRead(made.all.value, made.now.value, readThrough);

      if (due !== null) {
        readThrough = due;
        void reload();
      }
    }, TICK_MS);
  }

  return made;
}

// What answering the question would send, once he has set it. A question is settled by one of two
// things and never both — an option's own number, or words he wrote in an option's place — and
// this is the one place the two are read as one: whichever is set is what a press would send, and
// nothing at all is what an unset card sends.
export interface QuestionReply {
  chosen?: number;
  answer?: string;
}

export function questionReply(picked: number | null, words: string): QuestionReply | null {
  const said = words.trim();

  if (picked !== null) {
    return { chosen: picked };
  }

  return said === "" ? null : { answer: said };
}

// What the one button under a question says it will do. It names what is set rather than the act,
// so a press is never a step into the dark: he reads the number he is about to send before he
// sends it.
export function questionSendLabel(t: Translate, picked: number | null, words: string): string {
  if (picked !== null) {
    return t("question.action.answer_with", { number: picked + 1 });
  }

  return words.trim() === "" ? t("question.action.answer") : t("question.action.answer_as_written");
}

// Where the talk over a question stands for the person talking (docs/web.md, 「Talking a question over」): the job
// answering what was last said to it, the job not yet handed it, or nothing to wait for — the job spoke last, or
// nobody has said anything. Handed is the asker's own mark on the question, the last reply its waiting run was given.
export type TalkWait = "writing" | "unheard" | null;

export function talkWait(talk: QuestionTalk): TalkWait {
  const last = talk.turns.at(-1);

  if (last === undefined || last.byAsker || !talk.open) return null;

  return talk.heardThrough !== null && talk.heardThrough >= last.id ? "writing" : "unheard";
}

// Which questions have their talk open, by number, for the whole tab: a talk stays open while the window folds
// and unfolds or turns from a window into a sheet, and closes only where the reader closes it.
export function useOpenTalks(): Ref<number[]> {
  return useState<number[]>("question-talks", () => []);
}
