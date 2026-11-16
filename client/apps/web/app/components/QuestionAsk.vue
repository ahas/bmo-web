<template>
  <!-- A job is standing still behind each of these until it is answered, and this is where the answering is done:
       the questions window over the owner's own room, and the item's modal for that item's questions (docs/web.md,
       「The questions window」). It is nothing at all while nothing is waiting.

       In the window the questions are one list, each parted from the next by a line, the window's body their one
       scroll; in the item's modal each stands as a card of its own in the warning colour. -->
  <div v-if="shown.length > 0 || questionFailure !== null" class="flex flex-col" :class="props.listed ? 'divide-y divide-default' : 'gap-2'">
    <!-- An answer that arrived after the question was settled. It stands on its own, since
         the question it was for has left the screen by the time it is read, at the head of what waits so it is
         read first. In the window it is one more entry of the list rather than a box inside the window's box. -->
    <div
      v-if="questionFailure !== null"
      class="flex items-start gap-1"
      :class="props.listed ? 'p-4' : 'rounded-md border border-error/40 bg-error/5 p-2'"
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

    <section
      v-for="card in shown"
      :key="card.id"
      :aria-label="$t('question.label.asked', { id: card.todoId })"
      :class="props.listed ? 'p-4' : 'rounded-md border border-warning bg-warning/10 p-2'"
    >
      <!-- Which job and item asks, by its number and its title; who asked and how long ago under it. -->
      <ItemTip :id="card.todoId" eager as="p" class="text-sm font-medium break-words text-warning">
        <template #default="{ item }">{{ $t("question.label.job", { id: card.todoId }) }}<template v-if="item !== null"> · {{ item.title }}</template></template>
      </ItemTip>

      <div class="mt-1 flex flex-wrap items-center justify-between gap-1">
        <p class="text-sm text-muted">{{ card.asked }}</p>

        <!-- The clock, and the one press that stops it. A minute is short for reading while he is
             here, and stopping it is how he says he is. The stop is this question's alone, and the
             same press starts its countdown again from what it had left; the card stays either way. -->
        <div class="flex flex-wrap items-center gap-1">
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

      <!-- The talk over this question with the job that asked it, between what the question says and what answers
           it, so the choices stand right under the talk once it has made the question clear. -->
      <QuestionTalk v-if="talksOpen.includes(card.id)" :question="card.id" :todo-id="card.todoId" class="mt-2" />

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

        <!-- The talk over the question, opened and closed, right under the choices it is about and drawn as one
             of them, since asking what they mean is the other thing he does with them. It is an action and no
             answer: it carries an icon in place of a number, never takes the recommended mark, and chooses
             nothing. -->
        <UButton
          size="xs"
          color="neutral"
          :variant="talksOpen.includes(card.id) ? 'soft' : 'subtle'"
          :icon="talksOpen.includes(card.id) ? 'i-material-symbols-forum' : 'i-material-symbols-forum-outline'"
          :label="$t('question.action.discuss')"
          class="justify-start text-start"
          :aria-pressed="talksOpen.includes(card.id)"
          :aria-expanded="talksOpen.includes(card.id)"
          @click="toggleTalk(card)"
        />
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

        <!-- The card's actions sit at its right edge, at every width. The press that sends stands last, at the
             edge itself, so taking a choice back appears beside it without moving it. -->
        <div class="flex flex-wrap items-center justify-end gap-1">
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
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ANSWER_LIMIT } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";
import { questionReply, questionSendLabel, useOpenQuestions, useOpenTalks } from "~/domain/questions";

import type { QuestionCard } from "~/domain/questions";

// Answering what a job stopped to ask. It is one component and it stands in one place, because
// two places to answer from would be two rows to keep true about the same question — and the
// strip that says a job is waiting leads here for the same reason.

const { t } = useI18n();
interface Props {
  // Only this item's questions, where a screen stands the asking beside one item; every open question otherwise.
  only?: number | null;
  // Whether the questions stand as one list in a window of their own rather than as cards on a screen.
  listed?: boolean;
}

const props = withDefaults(defineProps<Props>(), { only: null, listed: false });

// Whether an answer that came too late stands to be read, so what holds this place keeps it standing for it.
const emit = defineEmits<{ failure: [held: boolean] }>();

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

watch(questionFailure, (failure) => emit("failure", failure !== null));
// Whether each card's question stands as its reading, which its reason and its options follow.
const readingShown = ref<Record<number, boolean>>({});

// Which questions have their talk open, for the whole tab, so a talk stays open wherever its question stands.
const talksOpen = useOpenTalks();

function toggleTalk(card: QuestionCard): void {
  talksOpen.value = talksOpen.value.includes(card.id) ? talksOpen.value.filter((id) => id !== card.id) : [...talksOpen.value, card.id];
}

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

// Stopping this question's clock, or starting it again. bmo-job writes it on the question's own row, and the card
// shows what the re-read brings, so a stop never reaches another question.
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
