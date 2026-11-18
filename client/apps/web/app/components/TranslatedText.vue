<template>
  <!-- A text a worker or a job wrote, read in the language it was written in or in the reader's own, one at a time in
       the same place (docs/web.md, 「The original, and its translation in its place」): a line above it asks the
       reading, which then takes the original's place whole, and puts the original back. A text in the reader's own
       language carries no line. -->
  <div class="flex min-w-0 flex-col gap-1">
    <!-- What the line says takes its room and its one button stands at the line's right end in every state, so neither
         the words changing nor the press moves it. -->
    <div v-if="wanted" class="flex min-w-0 items-center gap-1 text-sm text-muted" data-reading>
      <UIcon name="i-material-symbols-translate" class="size-3.5 shrink-0" />

      <template v-if="shown">
        <span class="min-w-0 flex-1 break-words">{{ reading.kind === "read" && !reading.whole ? $t("common.label.translated_in_part_from", { language: languageName($t, source) }) : $t("common.label.translated_from", { language: languageName($t, source) }) }}</span>
        <UButton size="sm" color="neutral" variant="link" class="shrink-0 p-0" :label="$t('common.action.show_original')" :aria-pressed="false" data-reading-original @click="translated = false" />
      </template>

      <span v-else-if="reading.kind === 'asking'" role="status">{{ $t("common.status.translating") }}</span>

      <template v-else-if="reading.kind === 'busy' || reading.kind === 'failed'">
        <span role="alert" class="min-w-0 flex-1 break-words" :class="reading.kind === 'busy' ? 'text-warning' : 'text-error'">
          {{ reading.kind === "busy" ? $t("common.status.translation_busy") : $t("common.error.translation_failed") }}
        </span>
        <UButton size="sm" color="neutral" variant="link" class="shrink-0 p-0" :label="$t('common.action.retry_translation')" @click="show" />
      </template>

      <!-- The reason a disabled line cannot ask stands in its tooltip, and a disabled button takes no pointer, so the
           tooltip hangs on the wrapper that holds it. -->
      <UTooltip v-else :text="blockedText" :disabled="blockedText === ''">
        <span class="ms-auto inline-flex shrink-0">
          <UButton
            size="sm"
            color="neutral"
            variant="link"
            class="p-0"
            :label="$t('common.action.show_translation')"
            :disabled="blockedText !== ''"
            data-reading-translate
            @click="show"
          />
        </span>
      </UTooltip>
    </div>

    <!-- The text standing now, the original or its reading, drawn by the slot where the place draws its own. -->
    <slot :text="standing">
      <MarkdownText :text="standing" :kind="props.kind" :class="props.textClass" />
    </slot>
  </div>
</template>

<script setup lang="ts">
import { textLanguage } from "#shared/translation";
import { languageName } from "~/domain/documents";
import { readerLanguage, useAskedReading, useAutoTranslate, wantsReading } from "~/domain/text-reading";

import type { MarkdownKind } from "~/domain/markdown";
import type { DocumentLanguage } from "#shared/types";

interface Props {
  text: string;
  kind?: MarkdownKind;
  // What the original and its reading are drawn with, alike.
  textClass?: string;
}

const props = withDefaults(defineProps<Props>(), { kind: "words", textClass: "text-sm text-highlighted" });
// Whether the reading stands in the original's place, told as it changes, so a place reading other texts beside
// this one under its one line follows it.
const emit = defineEmits<{ shown: [boolean] }>();

const { locale, t } = useI18n();
const language = computed(() => readerLanguage(locale.value));
const wanted = computed(() => wantsReading(props.text, language.value));
const source = computed<DocumentLanguage>(() => textLanguage(props.text));
const { reading, blocked, ask } = useAskedReading(
  () => props.text,
  () => language.value
);

// Whether the reading stands in the original's place: asked as a text opens where this browser translates on its own,
// else as the reader presses for it; showing the original puts it back until another text opens.
const auto = useAutoTranslate();
const translated = ref(false);
const shown = computed(() => translated.value && reading.value.kind === "read");
const standing = computed(() => (shown.value && reading.value.kind === "read" ? reading.value.text : props.text));

watch(shown, (now) => emit("shown", now), { immediate: true });

watch(
  [() => props.text, auto],
  () => {
    translated.value = false;

    if (auto.value && wanted.value) show();
  },
  { immediate: true }
);

function show(): void {
  translated.value = true;

  if (reading.value.kind !== "read") ask();
}

// Why the line cannot ask now, in the pack's words; empty where it can. A translator too busy says so on the line,
// with a retry, rather than closing it.
const blockedText = computed(() => (blocked.value === "absent" ? t("common.message.translator_absent") : ""));
</script>
