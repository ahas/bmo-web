<template>
  <!-- The talk over one question with the job that asked it (docs/web.md, 「Talking a question over」): every turn
       said so far, kept by bmo-job with the question, where the job's answer stands, and the box a word to the job is
       written in. It stands inside the question's card between the reason and the choices, set off by a rule rather
       than a box of its own, since the card may already be one. It scrolls with whatever holds the card. -->
  <div class="flex flex-col gap-2 border-s-2 border-default ps-3" role="group" :aria-label="$t('question.label.talk')">
    <ContentSkeleton
      v-if="talk === null && failure === null"
      :rows="2"
      listClass="flex flex-col gap-2"
      :label="$t('question.status.talk_loading')"
    >
      <div>
        <SkeletonLine width="w-16" />
        <SkeletonText :lines="2" size="sm" lastWidth="w-2/3" />
      </div>
    </ContentSkeleton>

    <p v-else-if="talk !== null && talk.turns.length === 0" class="text-sm text-muted">{{ $t("question.status.no_talk") }}</p>

    <div v-for="turn in talk?.turns ?? []" :key="turn.id" class="flex min-w-0 flex-col gap-1">
      <p class="text-sm font-medium" :class="turn.byAsker ? 'text-warning' : 'text-primary'">{{ speaker(turn) }}</p>
      <!-- The job writes in its own language, as it asked; a person's words stand as they were said. -->
      <TranslatedText v-if="turn.byAsker" :text="turn.text" />
      <MarkdownText v-else :text="turn.text" class="text-sm break-words text-highlighted" />
    </div>

    <p v-if="wait === 'writing'" role="status" class="flex items-center gap-1 text-sm text-muted">
      <UIcon name="i-material-symbols-progress-activity" class="size-4 shrink-0 animate-spin" />
      {{ $t("question.status.talk_writing") }}
    </p>
    <p v-else-if="wait === 'unheard'" role="status" class="text-sm text-muted">{{ $t("question.status.talk_unheard") }}</p>

    <p v-if="failure !== null" role="alert" class="text-sm break-words text-error">{{ failure }}</p>

    <ChatInput
      v-model="words"
      :placeholder="$t('question.placeholder.talk')"
      :label="$t('question.aria.talk')"
      :maxlength="TALK_LIMIT"
      :busy="sending"
      @submit="send"
    />
  </div>
</template>

<script setup lang="ts">
import { TALK_LIMIT } from "#shared/config";
import { failureText } from "bmo-ui/app/domain/errors";
import { useLiveRefresh } from "~/domain/events";
import { talkWait } from "~/domain/questions";

import type { QuestionTalk, QuestionTalkTurn } from "#shared/types";

interface Props {
  // The question talked over, and the item whose job asked it.
  question: number;
  todoId: number;
}

const props = defineProps<Props>();

// What the job service names the person a word in the chat comes from, as it keeps that word's actor.
const CHAT_OWNER = "owner";

const { t } = useI18n();

const talk = ref<QuestionTalk | null>(null);
const failure = ref<string | null>(null);
const words = ref("");
const sending = ref(false);

const wait = computed(() => (talk.value === null ? null : talkWait(talk.value)));

function speaker(turn: QuestionTalkTurn): string {
  if (turn.byAsker) return t("question.label.job", { id: props.todoId });

  return turn.name === CHAT_OWNER ? t("common.label.speaker_owner") : turn.name;
}

// One read of the talk. A read that fails keeps what was shown and says why; the first one that fails stands in the
// skeleton's place.
async function load(): Promise<void> {
  try {
    talk.value = await $fetch<QuestionTalk>("/api/question-talk", { query: { id: props.question } });
    failure.value = null;
  } catch (error) {
    failure.value = failureText(error, t("question.error.talk_read_failed"));
  }
}

// A word to the job. The words stay in the box until the job service has them, so a word that could not be sent is
// sent again from where it stands.
async function send(): Promise<void> {
  const say = words.value.trim();

  if (say === "" || sending.value) return;

  sending.value = true;

  try {
    await $fetch("/api/question-talk", { method: "POST", body: { id: props.question, say } });
    words.value = "";
    failure.value = null;
  } catch (error) {
    failure.value = failureText(error, t("question.error.talk_failed"));
  } finally {
    sending.value = false;
    await load();
  }
}

// bmo-job says a reply came or a question moved as the TODO moving, which is when a turn may have been added or the
// job handed one.
useLiveRefresh(() => void load(), { on: ["todo"] });

onMounted(() => void load());
</script>
