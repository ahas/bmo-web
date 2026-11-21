<template>
  <!-- The document part of the viewer: the open documents as tabs, one toolbar under them with
       how the document is read and what can be done to it, what the translation is doing, and the
       reader under it. -->
  <div ref="root" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <TabBar
      v-if="props.tabs.length > 0"
      :label="$t('documents.aria.open_documents')"
      :tabs="props.tabs"
      :active="props.selected === null ? null : documentKey(props.selected.root, props.selected.path)"
      @update:active="emit('tab', $event)"
      @close="emit('close-tabs', $event)"
      @move="(from: number, to: number) => emit('move-tab', from, to)"
      @pin="(id: string, on: boolean) => emit('pin-tab', id, on)"
    />

    <ToolBar :label="$t('documents.aria.toolbar')">
      <div>
        <UTooltip :text="props.listTool.label">
          <UButton
            color="neutral"
            :variant="props.listTool.pressed ? 'soft' : 'ghost'"
            size="sm"
            square
            :icon="props.listTool.icon"
            :aria-label="props.listTool.label"
            :aria-pressed="props.listTool.pressed"
            @click="props.listTool.onSelect()"
          />
        </UTooltip>
      </div>

      <template v-if="props.document !== null">
        <TabSwitch :model-value="props.view" :items="views" :label="$t('common.label.view')" :compact="tight" @update:model-value="emit('view', $event)" />

        <!-- That a translation is still going stands before the switch, in a place kept for it while none is, so
             neither its coming and going nor the switch's language name changing moves the other. Its mark spins
             only while one is coming in, and stands still where it is kept hidden. -->
        <div role="status" :class="translating ? '' : 'invisible'" :aria-hidden="!translating">
          <UTooltip :text="$t('documents.status.translating')">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              square
              icon="i-material-symbols-progress-activity"
              :ui="{ leadingIcon: translating ? 'animate-spin motion-reduce:animate-none' : '' }"
              :aria-label="$t('documents.status.translating')"
              @click="goToWaiting"
            />
          </UTooltip>
        </div>

        <div>
          <UTooltip :text="$t('documents.message.translation_unavailable')" :disabled="props.translatable">
            <USwitch
              size="sm"
              :model-value="props.translated"
              :label="translationLabel"
              :loading="props.asking"
              :disabled="!props.translatable"
              @update:model-value="emit('language', $event)"
            />
          </UTooltip>
        </div>
      </template>

      <ActionGroup
        class="ms-auto"
        :actions="actions"
        :properties="properties"
        :properties-title="props.document?.title ?? null"
        :label="$t('common.aria.document_menu')"
      />

      <div v-if="!props.narrow">
        <UTooltip :text="props.tocTool.label">
          <UButton
            color="neutral"
            :variant="props.tocTool.pressed ? 'soft' : 'ghost'"
            size="sm"
            square
            :icon="props.tocTool.icon"
            :aria-label="props.tocTool.label"
            :aria-pressed="props.tocTool.pressed"
            @click="props.tocTool.onSelect()"
          />
        </UTooltip>
      </div>
    </ToolBar>

    <div v-if="props.selected === null" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p class="text-sm text-muted">{{ $t("documents.message.choose_document") }}</p>
      <UButton v-if="props.narrow" size="sm" color="neutral" variant="subtle" :icon="props.listTool.icon" :label="$t('documents.action.list')" @click="props.listTool.onSelect()" />
    </div>

    <div v-else-if="props.failure !== ''" role="alert" class="flex items-center gap-2 p-4">
      <p class="min-w-0 flex-1 text-sm break-words text-error">{{ props.failure }}</p>
      <UButton class="shrink-0" size="sm" color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="emit('retry')" />
    </div>

    <ContentSkeleton v-else-if="props.document === null" class="p-4" :label="$t('documents.status.loading')">
      <SkeletonText :lines="10" size="base" lastWidth="w-2/5" />
    </ContentSkeleton>

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <!-- What went wrong with the translation, where something did; that it is still going stands in
           the toolbar. -->
      <div v-if="props.translated && trouble" class="flex shrink-0 flex-col gap-1 border-b border-default px-4 py-2 text-sm">
        <p v-if="props.translationFailure !== ''" role="alert" class="text-error">{{ props.translationFailure }}</p>
        <template v-else-if="props.translation !== null">
          <div v-if="props.translation.failure !== null" role="alert" class="flex items-center gap-2 text-error">
            <span class="min-w-0 flex-1 break-words">{{ failureLine }}</span>
            <UButton
              class="shrink-0"
              size="sm"
              color="neutral"
              variant="subtle"
              icon="i-material-symbols-refresh"
              :label="$t('documents.action.retry_translation')"
              :loading="props.asking"
              @click="emit('translate', false)"
            />
          </div>
          <div v-if="failedParts > 0" role="status" class="flex items-center gap-2 text-warning">
            <span class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span class="tabular-nums">{{ $t("documents.status.translation_failed_parts", { n: countText(failedParts) }) }}</span>
              <!-- What the translator said of the parts it could not carry, each different sentence once, in its own
                   words. -->
              <span v-for="said in failureSentences" :key="said" class="min-w-0 break-words text-muted">{{ said }}</span>
            </span>
            <UButton class="shrink-0" size="sm" color="neutral" variant="subtle" :label="$t('documents.action.retry_translation')" :loading="props.asking" @click="emit('translate', true)" />
          </div>
        </template>
      </div>

      <DocumentReader
        ref="reader"
        :text="props.text"
        :headings="props.headings"
        :view="props.view"
        :path="props.document.path"
        :waiting="props.waiting"
        :untranslated="props.untranslated"
        :pieces="props.pieces"
        :id-suffix="props.narrow ? 'narrow' : 'wide'"
        @active="emit('active', $event)"
        @ask="emit('ask', $event)"
        @open="emit('open', $event)"
        @ready="emit('ready')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { fileSizeText } from "#shared/file-sizes";
import { translationFailureLine } from "#shared/translation";

import { bmoLabel } from "~/domain/agents";
import { documentKey, languageName, READER_VIEWS } from "~/domain/documents";
import { countText } from "~/domain/numbers";
import { useWidth } from "bmo-ui/app/domain/screen";

import type { ReaderView, ViewerHeading } from "~/domain/documents";
import type { BarAction, BarProperty, BarTab } from "bmo-ui/app/domain/tabs";
import type { DocumentTranslation, DocumentView } from "#shared/types";

// The document part of the document viewer. The page holds the state — which document, which
// language, which view — and this part shows it and says what was pressed.

interface Range {
  from: number;
  to: number;
}

interface Props {
  selected: { root: string; path: string } | null;
  document: DocumentView | null;
  failure: string;
  text: string;
  headings: readonly ViewerHeading[];
  view: ReaderView;
  narrow: boolean;
  translated: boolean;
  // Whether a translator is served at all; where none is, the switch stands unavailable.
  translatable: boolean;
  translation: DocumentTranslation | null;
  translationFailure: string;
  asking: boolean;
  waiting: readonly Range[];
  untranslated: readonly Range[];
  pieces: ReadonlyMap<string, string>;
  tabs: readonly BarTab[];
  // The list beside the document: folded on a wide screen, a sheet from the bottom on a phone. It
  // stands first in the toolbar, on the list's side.
  listTool: BarAction;
  // The contents beside the document, on the other side. On a phone it is one of the actions.
  tocTool: BarAction;
  // The screen's own tools, which stand after the document's actions.
  tools?: readonly BarAction[];
}

const props = withDefaults(defineProps<Props>(), { tools: () => [] });
const { t } = useI18n();

const emit = defineEmits<{
  tab: [key: string];
  "close-tabs": [keys: string[]];
  "move-tab": [from: number, to: number];
  "pin-tab": [key: string, on: boolean];
  retry: [];
  view: [view: ReaderView];
  language: [translated: boolean];
  translate: [retry: boolean];
  talk: [];
  active: [slug: string | null];
  ask: [passage: { text: string; heading: string | null }];
  open: [target: { path: string; hash: string | null }];
  ready: [];
}>();

const reader = useTemplateRef<{ goTo: (slug: string) => void; goToLine: (line: number) => void }>("reader");
const root = useTemplateRef<HTMLElement>("root");

// How wide the document's part is, which is what decides whether the toolbar can spell its switches
// out: the part is narrowed by its neighbours on a wide screen as well as by a phone.
const TIGHT_BELOW_PX = 720;
const width = useWidth(() => root.value, 0);
const tight = computed(() => props.narrow || width.value < TIGHT_BELOW_PX);

// The split is not offered on a narrow screen.
const views = computed(() => READER_VIEWS.filter((one) => !props.narrow || one.value !== "split").map((one) => ({ ...one, label: t(one.label) })));

// The translation is a state the document is read in, named by its language where there is room.
const translationLabel = computed(() => (tight.value ? t("documents.label.translation") : t("documents.label.translation_of", { language: languageName(t, target.value) })));

// What can be done to the document standing, at the right end of the toolbar. On a phone the
// contents are one of them.
const actions = computed<BarAction[]>(() => [
  ...(props.narrow ? [props.tocTool] : []),
  ...(props.document === null ? [] : [{ id: "talk", label: t("documents.action.ask_agent", { agent: bmoLabel(t) }), icon: "i-material-symbols-chat-bubble-outline", onSelect: () => emit("talk") }]),
  ...props.tools
]);

const target = computed(() => props.translation?.target ?? (props.document?.language === "ko" ? "en" : "ko"));

// What the document is, for the properties viewer: everything but the words themselves.
const properties = computed<BarProperty[] | null>(() => {
  const document = props.document;

  if (document === null) {
    return null;
  }

  return [
    { label: t("common.label.path"), value: documentKey(document.root, document.path), mono: true },
    { label: t("documents.label.kind"), value: document.label },
    { label: t("documents.label.writer"), value: document.writer },
    { label: t("common.label.size"), value: fileSizeText(document.size) },
    { label: t("common.label.original"), value: languageName(t, document.language) },
    ...(props.translated ? [{ label: t("documents.label.translation"), value: languageName(t, target.value) }] : [])
  ];
});

// The translated parts show up in the text as they arrive, so the text is the progress and the
// toolbar only says the work is going on; pressing it goes to the first part still waiting.
const translating = computed(() => props.translated && waitingParts.value > 0);

function goToWaiting(): void {
  const first = props.waiting[0];

  if (first !== undefined) {
    reader.value?.goToLine(first.from);
  }
}

const trouble = computed(
  () => props.translationFailure !== "" || (props.translation !== null && (props.translation.failure !== null || failedParts.value > 0))
);

const waitingParts = computed(() => (props.translation?.parts ?? []).filter((part) => part.text === null && !part.failed).length);
const failedParts = computed(() => (props.translation?.parts ?? []).filter((part) => part.failed).length);
const failureSentences = computed(() => [...new Set((props.translation?.parts ?? []).flatMap((part) => (part.failed && part.failure !== null && part.failure !== "" ? [part.failure] : [])))]);

const failureLine = computed(() => translationFailureLine(props.translation?.failure));

defineExpose({
  goTo: (slug: string) => reader.value?.goTo(slug),
  goToLine: (line: number) => reader.value?.goToLine(line)
});
</script>
