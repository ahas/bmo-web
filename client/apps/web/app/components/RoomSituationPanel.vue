<template>
  <!-- The room's situation note as it stands, the room information's situation tab (docs/web.md, the room screen's
       situation as it stands now): what the round that updates it before it judges a line wrote last, and when it
       last changed. A room the receiver holds no note for says so rather than standing an empty box. The note is read
       in the reader's language in its own place, a press away (docs/web.md, 「The original, and its translation in
       its place」). -->
  <div class="flex min-w-0 flex-col">
    <ContentSkeleton v-if="loading" :rows="3" listClass="flex flex-col gap-2" :label="$t('room.status.situation_loading')">
      <SkeletonBar class="h-4 w-full" />
      <SkeletonBar class="h-4 w-4/5" />
      <SkeletonBar class="h-3 w-24" />
    </ContentSkeleton>
    <p v-else-if="failed" class="text-sm text-error">{{ $t("room.error.situation_failed") }}</p>
    <p v-else-if="text === null" class="text-sm text-dimmed">{{ $t("room.status.situation_none") }}</p>
    <div v-else class="flex min-w-0 flex-col gap-2">
      <TranslatedText :text="text">
        <template #default="{ text: standing }">
          <p data-situation-note class="text-sm break-words whitespace-pre-wrap text-highlighted">{{ standing }}</p>
        </template>
      </TranslatedText>
      <p v-if="updatedAt !== null" class="text-sm text-dimmed tabular-nums">{{ $t("room.label.situation_updated", { time: formatStamp(updatedAt / 1000) }) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import type { RoomSituation } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const note = ref<RoomSituation | null>(null);
const loading = ref(false);
const failed = ref(false);

const text = computed<string | null>(() => {
  const held = note.value?.text ?? "";

  return held.trim() === "" ? null : held;
});
const updatedAt = computed<number | null>(() => note.value?.updatedAt ?? null);

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

// Each opening of the room information reads the note afresh, since a round may have written it since the last look.
onMounted(() => void read());
</script>
