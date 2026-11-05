<template>
  <!-- The room's situation note as it stands (docs/web.md, the room screen's situation entry): what the round that
       updates it before it judges a line wrote last, and when it last changed. A room the receiver holds no note for
       says so rather than standing an empty box. The note is read in the reader's language by its translate action,
       as a memory opened from the room's record is: nothing is asked until the action is pressed, the original is
       never hidden, and an action that cannot ask now stands disabled, saying why. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.situation')" :description="props.title">
    <ContentSkeleton v-if="loading" :rows="3" listClass="flex flex-col gap-2" :label="$t('room.status.situation_loading')">
      <SkeletonBar class="h-4 w-full" />
      <SkeletonBar class="h-4 w-4/5" />
      <SkeletonBar class="h-3 w-24" />
    </ContentSkeleton>
    <p v-else-if="failed" class="text-sm text-error">{{ $t("room.error.situation_failed") }}</p>
    <p v-else-if="text === null" class="text-sm text-dimmed">{{ $t("room.status.situation_none") }}</p>
    <div v-else class="flex min-w-0 flex-col gap-2">
      <div class="flex flex-wrap items-center justify-end gap-2">
        <!-- The reason a disabled action cannot ask stands in its tooltip, and a disabled button takes no pointer, so the
             tooltip hangs on the wrapper that holds it. -->
        <UTooltip :text="blockedText" :disabled="blockedText === ''">
          <span data-situation-translate-holder class="inline-flex">
            <UButton
              size="sm"
              color="neutral"
              variant="subtle"
              icon="i-material-symbols-translate"
              :label="asking ? $t('common.status.translating') : $t('common.action.translate')"
              :disabled="blockedText !== '' || asking"
              data-situation-translate
              @click="ask"
            />
          </span>
        </UTooltip>
      </div>

      <p data-situation-note class="text-sm break-words whitespace-pre-wrap text-highlighted">{{ text }}</p>
      <p v-if="updatedAt !== null" class="text-sm text-dimmed tabular-nums">{{ $t("room.label.situation_updated", { time: formatStamp(updatedAt / 1000) }) }}</p>

      <div v-if="reading.kind !== 'none'" class="flex min-w-0 flex-col gap-1 border-t border-default pt-2" data-situation-reading>
        <p class="text-sm font-medium text-muted">{{ $t("documents.label.translation_of", { language: languageName($t, language) }) }}</p>

        <template v-if="reading.kind === 'read'">
          <p class="text-sm break-words whitespace-pre-wrap text-highlighted" data-situation-read-translation>{{ reading.text }}</p>
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

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import { languageName } from "~/domain/documents";
import { readerLanguage, useAskedReading } from "~/domain/text-reading";

import type { RoomSituation } from "#shared/types";

interface Props {
  chatId: number;
  title: string;
}

const props = defineProps<Props>();

const open = defineModel<boolean>("open", { required: true });

const note = ref<RoomSituation | null>(null);
const loading = ref(false);
const failed = ref(false);

const text = computed<string | null>(() => {
  const held = note.value?.text ?? "";

  return held.trim() === "" ? null : held;
});
const updatedAt = computed<number | null>(() => note.value?.updatedAt ?? null);

const { locale, t } = useI18n();
const language = computed(() => readerLanguage(locale.value));
const { reading, blocked, ask } = useAskedReading(
  () => text.value ?? "",
  () => language.value
);

const asking = computed(() => reading.value.kind === "asking");
// Why the action cannot ask now, in the pack's words; empty where it can.
const blockedText = computed(() => {
  if (blocked.value === "absent") return t("common.message.translator_absent");
  if (blocked.value === "busy") return t("common.message.translator_busy");

  return "";
});

async function read(): Promise<void> {
  loading.value = true;
  failed.value = false;

  try {
    note.value = await $fetch<RoomSituation>(`/api/rooms/${props.chatId}/situation`);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

// Each opening reads the note afresh, since a round may have written it since the last look.
watch(open, (standing) => {
  if (standing) void read();
});
</script>
