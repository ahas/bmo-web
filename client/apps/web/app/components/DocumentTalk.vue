<template>
  <!-- The talk about the open document, in a drawer at the side. The passage being asked about is
       quoted over the box; each of the owner's turns carries the passage it was said over, and pressing
       that quote goes to where it stands. -->
  <component :is="narrow ? UDrawer : USlideover" v-bind="shell" v-model:open="open" :title="$t('documents.title.talk')" :description="props.title">
    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-3">
        <ContentSkeleton v-if="loading && turns.length === 0" :rows="3" listClass="flex flex-col gap-3" :label="$t('documents.status.talk_loading')">
          <div class="flex flex-col gap-1">
            <SkeletonLine width="w-16" />
            <SkeletonText :lines="2" size="sm" lastWidth="w-2/3" />
          </div>
        </ContentSkeleton>
        <div v-if="failure !== ''" role="alert" class="flex items-center gap-2">
          <p class="min-w-0 flex-1 text-sm break-words text-error">{{ failure }}</p>
          <UButton class="shrink-0" size="sm" color="neutral" variant="subtle" :label="$t('common.action.refresh')" :loading="loading" @click="load" />
        </div>
        <p v-if="!loading && turns.length === 0 && failure === ''" class="text-sm text-muted">
          {{ $t("documents.status.no_talk") }}
        </p>

        <ol ref="list" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain" :aria-label="$t('documents.aria.talk_log')">
          <li v-for="turn in turns" :key="turn.id" class="flex flex-col gap-1">
            <p class="text-sm font-medium" :class="turn.speaker === 'owner' ? 'text-primary' : 'text-muted'">
              {{ turn.speaker === "owner" ? $t("common.label.speaker_owner") : $t("common.label.speaker_bmo") }}
            </p>
            <button
              v-if="turn.passage !== null"
              type="button"
              class="rounded-sm border-s-2 border-(--ui-text-muted) ps-2 text-start text-sm text-muted hover:text-default focus-inset"
              :aria-label="turn.heading === null ? $t('documents.aria.jump_quote') : $t('documents.aria.jump_quote_named', { heading: turn.heading })"
              @click="emit('jump', turn.heading)"
            >
              <span v-if="turn.heading !== null" class="block font-medium">{{ turn.heading }}<template v-if="turn.translated"> · {{ $t("documents.label.from_translation") }}</template></span>
              <span class="line-clamp-3 whitespace-pre-wrap">{{ turn.passage }}</span>
            </button>
            <MarkdownText :text="turn.text" class="text-sm text-highlighted" />
          </li>
        </ol>

        <p v-if="answering" class="text-sm text-muted" role="status">{{ $t("common.status.bmo_answering") }}</p>
        <p v-else-if="unanswered !== null" class="text-sm text-warning" role="status">{{ unanswered }}</p>
        <p v-if="sendFailure !== ''" class="text-sm text-error" role="alert">{{ sendFailure }}</p>

        <ChatInput
          ref="box"
          v-model="text"
          split
          :placeholder="askLabel"
          :maxlength="TALK_LIMIT"
          :disabled="answering"
          :busy="sending"
          @submit="send"
        >
          <template v-if="quote !== null" #header>
            <div class="flex w-full items-start gap-2 rounded-md bg-elevated p-2">
              <div class="min-w-0 flex-1 text-sm text-toned">
                <p v-if="quote.heading !== null" class="font-medium text-default">
                  {{ quote.heading }}<template v-if="quote.translated"> · {{ $t("documents.label.from_translation") }}</template>
                </p>
                <p class="line-clamp-4 whitespace-pre-wrap">{{ quote.text }}</p>
              </div>
              <UTooltip :text="$t('documents.action.remove_quote')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-close" :aria-label="$t('documents.action.remove_quote')" @click="quote = null" />
              </UTooltip>
            </div>
          </template>
        </ChatInput>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { DOCUMENT_PASSAGE_LIMIT, TALK_LIMIT } from "#shared/config";
import { UDrawer, USlideover } from "#components";
import { failureText } from "bmo-ui/app/domain/errors";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { bmoLabel } from "~/domain/agents";
import { useLiveRefresh } from "~/domain/events";

import type { DocumentTalk, DocumentTalkTurn } from "#shared/types";

// The talk about one document, the way the TODO panel talks about an item: the owner's words are written
// down at once, the chat agent's session answers in its turn, and the answer arrives as the news that the
// talk moved. Nothing here reaches a room.

interface Props {
  document: { root: string; path: string } | null;
  title: string;
}

const { t } = useI18n();
// What the words box asks for: words to the chat agent, by the label it goes by.
const askLabel = computed(() => t("documents.action.ask_agent", { agent: bmoLabel(t) }));
const props = defineProps<Props>();
const emit = defineEmits<{ jump: [heading: string | null] }>();
const open = defineModel<boolean>("open", { default: false });

// At the side on a wide screen, up from the bottom edge on a narrow one.
const narrow = useNarrow();
const shell = computed(() => (narrow.value ? { ui: { content: "h-[85svh]" } } : { side: "right" as const }));
// The passage being asked about, and whether it was selected in the translation.
const quote = defineModel<{ text: string; heading: string | null; translated: boolean } | null>("quote", { default: null });

const turns = ref<DocumentTalkTurn[]>([]);
const loading = ref(false);
const failure = ref("");
const answering = ref(false);
const unanswered = ref<string | null>(null);
const text = ref("");
const sending = ref(false);
const sendFailure = ref("");
const list = useTemplateRef<HTMLElement>("list");
const box = useTemplateRef<{ focus: () => void }>("box");
let asked = 0;

const documentName = computed(() => (props.document === null ? null : `${props.document.root}/${props.document.path}`));

async function load(): Promise<void> {
  const document = props.document;

  if (document === null) {
    turns.value = [];

    return;
  }

  const mine = ++asked;

  loading.value = true;
  failure.value = "";

  try {
    const answer = await $fetch<DocumentTalk>("/api/documents/talk", { query: document });

    if (mine === asked) {
      turns.value = answer.turns;
      answering.value = answer.answering;
      unanswered.value = answer.failure;
    }
  } catch (error) {
    if (mine === asked) {
      failure.value = failureText(error, t("documents.error.talk_read_failed"));
    }
  } finally {
    if (mine === asked) {
      loading.value = false;
    }
  }
}

async function send(): Promise<void> {
  const said = text.value.trim();
  const document = props.document;

  if (said === "" || document === null || sending.value || answering.value) {
    return;
  }

  sending.value = true;
  sendFailure.value = "";

  try {
    await $fetch("/api/documents/talk", {
      method: "POST",
      body: {
        ...document,
        text: said,
        passage: quote.value?.text.slice(0, DOCUMENT_PASSAGE_LIMIT) ?? null,
        heading: quote.value?.heading ?? null,
        translated: quote.value?.translated === true
      }
    });
    text.value = "";
    quote.value = null;
    await load();
  } catch (error) {
    // Words the console refused were not written down, so they stay in the box to send again.
    sendFailure.value = failureText(error, t("common.error.send_failed"));
  } finally {
    sending.value = false;
  }
}

watch(documentName, () => {
  turns.value = [];
  unanswered.value = null;
  sendFailure.value = "";

  if (open.value) {
    void load();
  }
});

watch(open, async (opened) => {
  if (!opened) {
    return;
  }

  await load();
  await nextTick();
  box.value?.focus();
});

// The newest turn is the one waited for, so the list goes to its foot when the talk grows.
watch(
  () => turns.value.length,
  async () => {
    await nextTick();

    if (list.value !== null) {
      list.value.scrollTop = list.value.scrollHeight;
    }
  }
);

useLiveRefresh(
  () => {
    if (open.value) {
      void load();
    }
  },
  {
    on: ["document-talk"],
    where: (event) => event.type === "document-talk" && event.document === documentName.value
  }
);
</script>
