<template>
  <!-- The room's situation note as it stands (docs/web.md, the room screen's situation entry): what the round that
       updates it before it judges a line wrote last, and when it last changed. A room the receiver holds no note for
       says so rather than standing an empty box. -->
  <SettingsDialog v-model:open="open" :title="$t('room.title.situation')" :description="props.title">
    <ContentSkeleton v-if="status === 'pending'" :rows="3" listClass="flex flex-col gap-2" :label="$t('room.status.situation_loading')">
      <SkeletonBar class="h-4 w-full" />
      <SkeletonBar class="h-4 w-4/5" />
      <SkeletonBar class="h-3 w-24" />
    </ContentSkeleton>
    <p v-else-if="failed" class="text-sm text-error">{{ $t("room.error.situation_failed") }}</p>
    <p v-else-if="text === null" class="text-sm text-dimmed">{{ $t("room.status.situation_none") }}</p>
    <div v-else class="flex min-w-0 flex-col gap-2">
      <p data-situation-note class="text-sm break-words whitespace-pre-wrap text-highlighted">{{ text }}</p>
      <p v-if="updatedAt !== null" class="text-sm text-dimmed tabular-nums">{{ $t("room.label.situation_updated", { time: formatStamp(updatedAt / 1000) }) }}</p>
    </div>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.close')" color="neutral" variant="ghost" @click="close()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import type { RoomSituation } from "#shared/types";

interface Props {
  chatId: number;
  title: string;
}

const props = defineProps<Props>();

const open = defineModel<boolean>("open", { required: true });

const { data, status, error, refresh } = useFetch<RoomSituation>(() => `/api/rooms/${props.chatId}/situation`, {
  key: () => `room-situation-${props.chatId}`,
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ text: null, updatedAt: null })
});

const failed = computed(() => status.value === "error" || error.value !== null);
const text = computed<string | null>(() => (data.value?.text ?? "").trim() === "" ? null : data.value!.text);
const updatedAt = computed<number | null>(() => data.value?.updatedAt ?? null);

// Each opening reads the note afresh, since a round may have written it since the last look.
watch(open, (standing) => {
  if (standing) void refresh();
});
</script>
