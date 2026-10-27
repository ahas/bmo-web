import { POLL_INTERVAL_MS, questionAnswerText } from "#shared/config";
import { roomRoute } from "#shared/paths";
import { useLiveRefresh } from "./events";
import { toUnixSeconds } from "bmo-ui/app/domain/time";

import type { OwnerChat, JobQuestion } from "#shared/types";
import type { Translate } from "#shared/wording";

// How one question reads at a glance. The three the owner has to tell apart are the one still
// waiting on him, the one he settled himself, and the one his silence settled; a fourth is the
// row nobody answered and no launcher closed either, which is a question whose job is gone.
export type QuestionState = "open" | "owner" | "deadline" | "missed";

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
  question: string;
  why: string;
  options: QuestionOption[];
  state: QuestionState;
  // The one line beside the question: how long is left while it is open, and who settled it and
  // how once it is not.
  status: string;
  // What it was settled on, in the words the job read. Null while it is still open.
  answer: string | null;
  // Whether answering it now would reach anybody. Only an open question does.
  answerable: boolean;
  // Whether he has stopped its clock from the console. A stopped question is still open: the
  // recommendation waits for the end of the stop instead of the end of the minute.
  paused: boolean;
}

// What the panel calls each state, in the words the item's own printout uses.
const STATE_LABELS: Record<QuestionState, string> = {
  open: "question.status.open",
  owner: "question.status.owner",
  deadline: "question.status.deadline",
  missed: "question.status.missed"
};

export function questionState(question: JobQuestion, now: number = toUnixSeconds(Date.now())): QuestionState {
  if (question.settledAt !== null) {
    return question.settledBy === "deadline" ? "deadline" : "owner";
  }

  // A question whose wait has run out is settled by its own launcher within the second, so a
  // row still open past its due time is one whose job is no longer there to read an answer.
  return question.dueAt > now ? "open" : "missed";
}

export function questionCard(t: Translate, question: JobQuestion, now: number = toUnixSeconds(Date.now())): QuestionCard {
  const state = questionState(question, now);
  const settled = state === "open" || state === "missed" ? null : questionAnswerText(question);

  return {
    id: question.id,
    todoId: question.todoId,
    question: question.question,
    why: question.why,
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
    paused: question.pausedLeft !== null
  };
}

// The questions still waiting on him, the nearest deadline first. A job is standing still behind
// each one, and the order that matters is which will be taken out of his hands soonest — it is
// sorted here rather than left to the order they arrived in, because the strip over every screen
// carries the first of them and that choice has to be the urgent one however the list was read. A
// stopped question's due time is the end of its stop, so it stands behind every running minute.
export function openQuestions(t: Translate, questions: JobQuestion[], now: number = toUnixSeconds(Date.now())): QuestionCard[] {
  return questions
    .filter((question) => questionState(question, now) === "open")
    .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)
    .map((question) => questionCard(t, question, now));
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

// The line beside the question. An open one says how long is left and what the silence would
// take, since that is the whole of what he is deciding by not answering; a stopped one says it is
// stopped and how long the stop still holds.
function statusLine(t: Translate, question: JobQuestion, state: QuestionState, now: number): string {
  if (state === "open" && question.pausedLeft !== null) {
    return question.recommended === null
      ? t("question.status.paused_alone", { time: remainingLabel(t, question.dueAt - now) })
      : t("question.status.paused", { time: remainingLabel(t, question.dueAt - now), number: question.recommended + 1 });
  }

  if (state === "open") {
    return question.recommended === null
      ? t("question.status.running_alone", { time: remainingLabel(t, question.dueAt - now) })
      : t("question.status.running", { time: remainingLabel(t, question.dueAt - now), number: question.recommended + 1 });
  }

  return t(STATE_LABELS[state]);
}

// How long is left, in the units the chat's own question uses: minutes while there are any,
// seconds at the end.
function remainingLabel(t: Translate, seconds: number): string {
  return seconds >= 60 ? t("common.label.minutes", { m: Math.ceil(seconds / 60) }) : t("common.label.seconds", { n: Math.max(0, seconds) });
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
    held.all.value = await $fetch<JobQuestion[]>("/api/questions");
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
    setInterval(() => {
      made.now.value = toUnixSeconds(Date.now());
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
