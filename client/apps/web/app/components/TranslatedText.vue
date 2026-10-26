<template>
  <!-- A text a worker or a job wrote: the original as it was written, and under it its reading in the reader's own
       language, headed by that language (docs/web.md, 「The original, and its translation under it」). The original is
       never hidden or replaced; the reading lands under it as it arrives. -->
  <div class="flex min-w-0 flex-col gap-2">
    <MarkdownText :text="props.text" :kind="props.kind" :class="props.textClass" />

    <div v-if="reading.kind !== 'none'" class="flex min-w-0 flex-col gap-1 border-t border-default pt-2" data-reading>
      <p class="text-sm font-medium text-muted">{{ $t("documents.label.translation_of", { language: languageName($t, language) }) }}</p>

      <p v-if="reading.kind === 'asking'" role="status" class="flex items-center gap-1 text-sm text-muted">
        <UIcon name="i-material-symbols-progress-activity" class="size-4 animate-spin motion-reduce:animate-none" />
        {{ $t("common.status.translating") }}
      </p>

      <template v-else-if="reading.kind === 'read'">
        <MarkdownText :text="reading.text" :kind="props.kind" :class="props.textClass" />
        <p v-if="!reading.whole" class="text-sm text-warning">{{ $t("common.status.translation_partial") }}</p>
      </template>

      <div v-else class="flex flex-wrap items-center gap-2" role="alert">
        <p class="min-w-0 flex-1 text-sm" :class="reading.kind === 'busy' ? 'text-warning' : 'text-error'">
          {{ reading.kind === "busy" ? $t("common.status.translation_busy") : $t("common.error.translation_failed") }}
        </p>
        <UButton size="sm" color="neutral" variant="subtle" :label="$t('common.action.retry_translation')" @click="retry" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { languageName } from "~/domain/documents";
import { readerLanguage, useTextReading } from "~/domain/text-reading";

import type { MarkdownKind } from "~/domain/markdown";

interface Props {
  text: string;
  kind?: MarkdownKind;
  // What the original and its reading are drawn with, alike.
  textClass?: string;
}

const props = withDefaults(defineProps<Props>(), { kind: "words", textClass: "text-sm text-highlighted" });

const { locale } = useI18n();
const language = computed(() => readerLanguage(locale.value));
const { reading, retry } = useTextReading(
  () => props.text,
  () => language.value
);
</script>
