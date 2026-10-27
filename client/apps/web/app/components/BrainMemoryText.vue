<template>
  <!-- A memory's words as the console reads them (docs/web.md, the room screen's brain chip, and the translated texts
       section): the text as the brain keeps it, a translate action beside it, and the reading the gate's translator
       gives under the original, headed by the reader's language. The original is never hidden or replaced, and nothing
       is asked until the action is pressed. An action that cannot ask now stands disabled, saying why: no translator is
       named, or the translator answered too busy. -->
  <div class="flex min-w-0 flex-col gap-2">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <!-- The reason a disabled action cannot ask stands in its tooltip, and a disabled button takes no pointer, so the
           tooltip hangs on the wrapper that holds it. -->
      <UTooltip :text="blockedText" :disabled="blockedText === ''">
        <span data-brain-translate-holder class="inline-flex">
          <UButton
            size="sm"
            color="neutral"
            variant="subtle"
            icon="i-material-symbols-translate"
            :label="asking ? $t('common.status.translating') : $t('common.action.translate')"
            :disabled="blockedText !== '' || asking"
            data-brain-translate
            @click="ask"
          />
        </span>
      </UTooltip>
    </div>

    <pre data-brain-read-text class="max-h-96 overflow-y-auto rounded-md bg-elevated p-3 font-sans text-sm whitespace-pre-wrap wrap-anywhere text-default">{{ props.text }}</pre>

    <div v-if="reading.kind !== 'none'" class="flex min-w-0 flex-col gap-1 border-t border-default pt-2" data-reading>
      <p class="text-sm font-medium text-muted">{{ $t("documents.label.translation_of", { language: languageName($t, language) }) }}</p>

      <template v-if="reading.kind === 'read'">
        <pre class="max-h-96 overflow-y-auto font-sans text-sm whitespace-pre-wrap wrap-anywhere text-highlighted" data-brain-read-translation>{{ reading.text }}</pre>
        <p v-if="!reading.whole" class="text-sm text-warning">{{ $t("common.status.translation_partial") }}</p>
      </template>

      <div v-else-if="reading.kind !== 'asking'" class="flex flex-wrap items-center gap-2" role="alert">
        <p class="min-w-0 flex-1 text-sm" :class="reading.kind === 'busy' ? 'text-warning' : 'text-error'">
          {{ reading.kind === "busy" ? $t("common.status.translation_busy") : $t("common.error.translation_failed") }}
        </p>
        <UButton size="sm" color="neutral" variant="subtle" :label="$t('common.action.retry_translation')" @click="ask" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { languageName } from "~/domain/documents";
import { readerLanguage, useAskedReading } from "~/domain/text-reading";

interface Props {
  // The memory's words as the brain keeps them.
  text: string;
}

const props = defineProps<Props>();

const { locale, t } = useI18n();
const language = computed(() => readerLanguage(locale.value));
const { reading, blocked, ask } = useAskedReading(
  () => props.text,
  () => language.value
);

const asking = computed(() => reading.value.kind === "asking");
// Why the action cannot ask now, in the pack's words; empty where it can.
const blockedText = computed(() => {
  if (blocked.value === "absent") return t("common.message.translator_absent");
  if (blocked.value === "busy") return t("common.message.translator_busy");

  return "";
});
</script>
