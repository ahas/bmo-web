<template>
  <!-- What the room adds up to, the room information's session tab for the administrator (docs/web.md, the room
       screen's session information). The block draws itself either way: every name in it is the screen's own and
       stands from the first frame, and only the figures beside them are waited for. -->
  <div class="flex min-w-0 flex-col">
    <SkeletonStatus v-if="!loaded && pending" as="div" :label="$t('room.status.session_loading')">
      <RoomStats :stats="null" />
    </SkeletonStatus>

    <ReadFailure :failure="failure" :message="failed" :reading="pending" @retry="read()" />
    <RoomStats v-if="loaded" :stats="stats" />
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useReadFailure } from "~/domain/events";
import { emptyRoomStats } from "~/domain/roomstats";

import type { RoomStats } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const { t } = useI18n();

const stats = ref<RoomStats>(emptyRoomStats(props.chatId));
const loaded = ref(false);
const pending = ref(false);
const failed = ref("");
let generation = 0;
onScopeDispose(() => { generation++; });

// The figures are counted when they are asked for, so each opening of the room information shows the room as it
// stands rather than as it stood.
async function read(): Promise<void> {
  const mine = ++generation;

  pending.value = true;
  failed.value = "";

  try {
    const answer = await $fetch<RoomStats>(`/api/rooms/${props.chatId}/stats`);

    if (mine !== generation) return;
    stats.value = answer;
    loaded.value = true;
  } catch (error) {
    if (mine !== generation) return;
    failed.value = failureText(error, t("room.error.session_failed"));
  } finally {
    if (mine === generation) pending.value = false;
  }
}

// Reading again is what the bot's return brings, while the tab stands.
const failure = useReadFailure({
  failed: () => failed.value !== "",
  reading: () => pending.value,
  reread: () => void read()
});

onMounted(() => void read());
</script>
