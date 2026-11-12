<template>
  <!-- A job is standing still behind each of these until it is answered, and this is the one
       place the answering is done. It stands in the conversation rather than beside it, over the
       box he types in: that is where his eyes and his hands already are when the bot asks him
       something, and it is fixed there, so no amount of scrolling takes it off the screen.

       It is nothing at all while nothing is waiting, so it is never in the way, and it never grows
       past its share of what is on the screen: a phone with the keyboard up has a few hundred
       pixels in all, and a stack of cards allowed to take them would push the box underneath it
       out of reach. Past that share the stack scrolls inside itself, so however many jobs are
       waiting the thing he answers them in stays where it is. -->
  <div
    v-if="shown.length > 0 || questionFailure !== null"
    class="mb-3 max-h-[calc(var(--bmo-screen)*0.4)] min-h-0 overflow-y-auto overscroll-contain"
  >
    <div
      v-for="card in shown"
      :key="card.id"
      class="mb-2 rounded-md border border-warning bg-warning/10 p-2 last:mb-0"
    >
      <div class="flex flex-wrap items-center justify-between gap-1">
        <ItemTip :id="card.todoId" as="p" class="text-sm font-medium text-warning">{{ $t("question.label.asked", { id: card.todoId }) }}</ItemTip>

        <!-- The clock, and the one press that stops it. A minute is short for reading while he is
             here, and stopping it is how he says he is: the recommendation then waits for the end
             of the stop, and the same press starts the countdown again from what it had left. -->
        <div class="flex items-center gap-1">
          <p class="text-sm tabular-nums text-warning">{{ card.status }}</p>

          <UButton
            size="xs"
            color="warning"
            variant="ghost"
            :icon="card.paused ? 'i-material-symbols-play-arrow' : 'i-material-symbols-pause'"
            :label="card.paused ? $t('question.action.resume') : $t('question.action.pause')"
            :aria-pressed="card.paused"
            :loading="pausing === card.id"
            :disabled="answering === card.id"
            @click="togglePause(card)"
          />
        </div>
      </div>

      <!-- An agent asks in its own language; the question, its reason and its options are read in the reader's
           together, under the question's one line, and showing the original there puts all of them back. What is sent is
           always the option as it was written. -->
      <TranslatedText :text="card.question" class="mt-1" @shown="readingShown[card.id] = $event" />
      <p class="mt-1 text-sm break-words text-muted">
        {{ $t("question.label.why") }}
        <TranslatedInline v-slot="{ text }" :text="card.why" :follow="readingShown[card.id] === true">
          <MarkdownText :text="text" kind="line" />
        </TranslatedInline>
      </p>

      <!-- Pressing an option chooses it; it does not send it. A job is standing still behind
           this question and what goes out cannot be taken back — the bot writes the row once and
           refuses a second answer — so a press that lands wrong would be unrecoverable. Choosing
           and sending are two presses, and pressing the chosen one again takes the choice back.
           The one filled in is drawn solid, so what is set is read off the screen rather than
           remembered. -->
      <div class="mt-2 flex flex-col gap-1">
        <UButton
          v-for="option in card.options"
          :key="option.number"
          size="xs"
          :color="option.recommended ? 'primary' : 'neutral'"
          :variant="picked[card.id] === option.number - 1 ? 'solid' : 'subtle'"
          class="justify-start text-start"
          :aria-pressed="picked[card.id] === option.number - 1"
          :disabled="answering === card.id"
          @click="choose(card, option.number - 1)"
        >
          <!-- One run of text, so a long option wraps as a sentence rather than as the button's flex
               items side by side, and the mark stands at its head, where wrapping cannot split it. -->
          <span>{{ option.number }}. <span v-if="option.recommended" class="whitespace-nowrap">{{ $t("question.label.recommended") }}</span> <TranslatedInline :text="option.text" :follow="readingShown[card.id] === true" /></span>
        </UButton>
      </div>

      <!-- The options do not always cover what he wants, and then he writes it: the job reads
           his own words in the option's place. Writing takes a chosen option back, since the
           two are one answer and the bot refuses a body that carries both. -->
      <div class="mt-2 flex flex-col gap-1">
        <GrowingTextarea
          :model-value="words[card.id] ?? ''"
          :rows="2"
          size="xs"
          :maxlength="ANSWER_LIMIT"
          :placeholder="$t('question.placeholder.own_answer')"
          :aria-label="$t('question.aria.own_answer')"
          @update:model-value="write(card, String($event))"
        />

        <div class="flex flex-wrap items-center gap-1">
          <!-- The one press that sends, and it says what it is about to send rather than what
               it does. Nothing is set, nothing goes. -->
          <UButton
            size="xs"
            color="neutral"
            variant="subtle"
            icon="i-material-symbols-keyboard-return"
            :label="sendLabel(card)"
            :disabled="questionReply(picked[card.id] ?? null, words[card.id] ?? '') === null"
            :loading="answering === card.id"
            @click="send(card)"
          />

          <!-- Taking a wrong press back without having to find the same button again. -->
          <UButton
            v-if="picked[card.id] !== undefined"
            size="xs"
            color="neutral"
            variant="ghost"
            :label="$t('question.action.unpick')"
            :disabled="answering === card.id"
            @click="unpick(card)"
          />
        </div>
      </div>
    </div>

    <!-- An answer that arrived after the question was settled. It stands on its own, since
         the question it was for has left the screen by the time it is read. -->
    <div
      v-if="questionFailure !== null"
      class="flex items-start gap-1 rounded-md border border-error/40 bg-error/5 p-2"
      :class="open.length > 0 ? 'mt-2' : ''"
    >
      <p class="flex-1 text-sm break-words text-error">{{ questionFailure }}</p>

      <UTooltip :text="$t('question.action.close')">
        <UButton
          icon="i-material-symbols-close"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="$t('question.action.close')"
          @click="questionFailure = null"
        />
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ANSWER_LIMIT } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";
import { questionReply, questionSendLabel, useOpenQuestions } from "~/domain/questions";

import type { QuestionCard } from "~/domain/questions";

// Answering what a job stopped to ask. It is one component and it stands in one place, because
// two places to answer from would be two rows to keep true about the same question — and the
// strip that says a job is waiting leads here for the same reason.

const { t } = useI18n();
interface Props {
  // Only this item's questions, where a screen stands the asking beside one item; every open question otherwise.
  only?: number | null;
}

const props = withDefaults(defineProps<Props>(), { only: null });

const { open, reload } = useOpenQuestions(t);

// The cards this place stands: the whole strip's, or the one item's where it was given.
const shown = computed(() => (props.only === null ? open.value : open.value.filter((card) => card.todoId === props.only)));

// Which option each open question has set, and what has been written into its box, before
// anything is sent. A card with nothing in either has nothing to send.
const picked = ref<Record<number, number>>({});
const words = ref<Record<number, string>>({});
const answering = ref<number | null>(null);
const pausing = ref<number | null>(null);
const questionFailure = ref<string | null>(null);
// Whether each card's question stands as its reading, which its reason and its options follow.
const readingShown = ref<Record<number, boolean>>({});

// Pressing an option sets it and sends nothing. Pressing the one already set takes it back, so
// a press that landed wrong is undone by the same press that made it. Choosing clears whatever
// was written, since the two are one answer and the bot refuses a body carrying both.
function choose(card: QuestionCard, chosen: number): void {
  if (picked.value[card.id] === chosen) {
    unpick(card);

    return;
  }

  picked.value = { ...picked.value, [card.id]: chosen };
  delete words.value[card.id];
}

function unpick(card: QuestionCard): void {
  const held = { ...picked.value };

  delete held[card.id];
  picked.value = held;
}

// Writing in the box is the other way of answering, so it takes a chosen option back the same way
// choosing takes the writing back.
function write(card: QuestionCard, said: string): void {
  words.value = { ...words.value, [card.id]: said };

  if (said.trim() !== "") {
    unpick(card);
  }
}

function sendLabel(card: QuestionCard): string {
  return questionSendLabel(t, picked.value[card.id] ?? null, words.value[card.id] ?? "");
}

// Stopping the clock, or starting it again. The bot writes it on the row, and the job waiting on
// the question reads the row, so what the card shows after the re-read is what the job follows.
async function togglePause(card: QuestionCard): Promise<void> {
  pausing.value = card.id;

  try {
    await $fetch("/api/question-pause", { method: "POST", body: { id: card.id, paused: !card.paused } });
    questionFailure.value = null;
  } catch (error) {
    questionFailure.value = failureText(error, card.paused ? t("question.error.resume_failed") : t("question.error.pause_failed"));
  } finally {
    pausing.value = null;
    await reload();
  }
}

// The one press that answers. Whichever of the two is set is what goes; with neither set the
// button is not pressable and this does nothing. The bot settles the row, and the job standing
// still behind it reads one line of text either way.
async function send(card: QuestionCard): Promise<void> {
  const reply = questionReply(picked.value[card.id] ?? null, words.value[card.id] ?? "");

  if (reply === null) {
    return;
  }

  answering.value = card.id;

  try {
    await $fetch("/api/questions", { method: "POST", body: { id: card.id, ...reply } });
    questionFailure.value = null;
    delete words.value[card.id];
    unpick(card);
  } catch (error) {
    // The chat or the deadline got there first. The row says what it was settled on, and the
    // re-read below is what puts that in the question's place.
    questionFailure.value = failureText(error, t("question.error.answer_failed"));
  } finally {
    answering.value = null;
    await reload();
  }
}
</script>
