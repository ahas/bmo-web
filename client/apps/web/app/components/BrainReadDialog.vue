<template>
  <!-- One piece a round read, opened from the brain list (docs/web.md, the room screen's brain chip): a small dialog centred at
       every width, which Back closes. It names the piece and how the round read it, and reads what it is the first
       time it opens: the brain's memory, with a way to its page on the brain's screen, or the gate's text of it. -->
  <SettingsDialog v-model:open="open" :title="shown === null ? '' : readLabel($t, shown, props.chatId)">
    <template v-if="shown !== null">
      <PropertyList :rows="rows" />

      <ContentSkeleton v-if="loading" :rows="4" listClass="flex flex-col gap-2" :label="$t('room.status.brain_read_loading')">
        <SkeletonBar class="h-4 w-full" />
      </ContentSkeleton>
      <p v-else-if="failure !== null" class="text-sm text-dimmed">{{ failure }}</p>
      <!-- The memory's words with the translate action beside them and its reading under it (docs/web.md, the
           translated texts section). -->
      <BrainMemoryText v-else-if="text !== null" :text="text" />
    </template>

    <template #footer="{ close }">
      <UButton
        v-if="piece?.memory != null"
        :label="$t('room.action.brain_read_page')"
        :icon="CHIP_ICONS.brain"
        color="neutral"
        variant="outline"
        :to="`/brain/${piece.memory.brainId}?memory=${piece.memory.id}`"
        data-brain-read-page
      />
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { formatStamp } from "bmo-ui/app/domain/time";

import { CHIP_ICONS } from "~/domain/chips";
import { readLabel, readNew } from "~/domain/drafting";

import type { BarProperty } from "bmo-ui/app/domain/tabs";
import type { BrainPiece, DraftRead } from "#shared/drafting";

interface Props {
  chatId: number;
  agent: string;
}

const props = defineProps<Props>();
// The piece to open; null closes the dialog.
const read = defineModel<DraftRead | null>("read", { required: true });
const { t } = useI18n();

// What the dialog shows, kept through its closing so it never empties while it slides away.
const shown = ref<DraftRead | null>(null);
const piece = ref<BrainPiece | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);
// What was read of each piece, so opening one again shows it at once.
const known = new Map<string, BrainPiece>();

const open = computed<boolean>({
  get: () => read.value !== null,
  set: (value) => {
    if (!value) read.value = null;
  }
});

watch(
  read,
  async (next) => {
    if (next === null) return;

    shown.value = next;
    failure.value = null;

    const key = `${next.path}#${next.memoryId ?? ""}`;
    const held = known.get(key);

    if (held !== undefined) {
      piece.value = held;
      loading.value = false;

      return;
    }

    piece.value = null;
    loading.value = true;

    try {
      const query: Record<string, string> = { path: next.path, agent: props.agent };

      if (next.memoryId != null) query.memoryId = String(next.memoryId);

      const answer = await $fetch<BrainPiece>(`/api/rooms/${props.chatId}/brain-piece`, { query });

      known.set(key, answer);
      if (read.value === next) piece.value = answer;
    } catch (error) {
      if (read.value === next) failure.value = failureText(error, t("room.error.brain_read_failed"));
    } finally {
      if (read.value === next) loading.value = false;
    }
  },
  { immediate: true }
);

const text = computed<string | null>(() => piece.value?.memory?.text ?? piece.value?.text ?? null);

// The piece's facts: how the round read it and where it stands, then what the brain holds of it as a memory.
const rows = computed<BarProperty[]>(() => {
  const one = shown.value;

  if (one === null) return [];

  const memory = piece.value?.memory ?? null;
  const facts: BarProperty[] = [
    { label: t("room.label.brain_read_how"), value: readNew(one) ? t("room.label.brain_read_new") : t("room.label.brain_read_held_one") },
    { label: t("common.label.path"), value: one.path, mono: true }
  ];

  if (memory === null) return facts;

  return [
    ...facts,
    ...(memory.key === null ? [] : [{ label: t("room.label.brain_read_key"), value: memory.key, mono: true }]),
    { label: t("room.label.brain_read_type"), value: memory.type, mono: true },
    { label: t("room.label.brain_read_layer"), value: memory.layer ?? t("common.label.none") },
    { label: t("room.label.brain_read_subjects"), value: memory.subjects.length === 0 ? t("common.label.none") : memory.subjects.map((subject) => `${subject.type} ${subject.key}`).join(", ") },
    { label: t("room.label.brain_read_written"), value: formatStamp(memory.writtenAt) }
  ];
});
</script>
