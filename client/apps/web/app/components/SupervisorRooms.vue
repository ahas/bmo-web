<template>
  <!-- A supervisor's own line under its screen's title bar (docs/web.md, 「Agent screen」): the stand-in mark with the
       provider and model while its turns go out on the stand-in, then every room its turns went into, the latest
       first, each opening this screen's log at its latest run there. The line scrolls sideways inside itself where it
       runs long. -->
  <div
    v-if="standIn !== null || rooms.length > 0"
    class="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-default px-4 py-2"
    role="group"
    :aria-label="$t('agents.aria.supervisor_rooms', { name: props.label })"
    data-supervisor-rooms
  >
    <UBadge v-if="standIn !== null" class="shrink-0" color="warning" variant="subtle" :label="$t('agents.status.standing_in', { road: standInRoad })" data-stand-in />

    <UTooltip v-for="room in rooms" :key="room.chatId" :text="$t('agents.label.room_last_run', { time: startedText(room) })">
      <NuxtLink
        :to="{ path: `/agents/${encodeURIComponent(props.name)}`, query: { run: room.lastRun } }"
        class="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors hover:bg-elevated active:bg-accented"
        :class="room.lastRun === props.run ? 'border-primary text-highlighted' : 'border-default text-toned'"
        :aria-label="$t('agents.aria.room_last_run', { room: titleOf(room.chatId), n: countText(room.runs), time: startedText(room) })"
        data-supervisor-room
      >
        <span class="max-w-48 truncate">{{ titleOf(room.chatId) }}</span>
        <span class="tabular-nums text-muted">{{ $t("agents.label.room_runs", { n: countText(room.runs) }) }}</span>
      </NuxtLink>
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import { roomTitle } from "~/domain/agents";
import { countText } from "~/domain/numbers";
import { usePolling } from "~/domain/polling";
import { modelLabel } from "~/domain/status";

import type { StandInView, SupervisorRoomView } from "#shared/axes";
import type { RoomSummary } from "#shared/types";

interface Props {
  name: string;
  label: string;
  // The run the screen stands at, whose room is marked.
  run?: string | null;
  rooms?: RoomSummary[];
}

const props = withDefaults(defineProps<Props>(), { run: null, rooms: () => [] });

const { t } = useI18n();

// How often the rooms and the stand-in are read again while the screen stands and is seen.
const READ_MS = 30_000;

const rooms = ref<SupervisorRoomView[]>([]);
const standIn = ref<StandInView | null>(null);

const standInRoad = computed(() => (standIn.value === null ? "" : `${standIn.value.provider} ${modelLabel(standIn.value.model)}`));

function startedText(room: SupervisorRoomView): string {
  return formatStamp(Math.floor(room.lastStartedAt / 1000));
}

function titleOf(chatId: number): string {
  return roomTitle(t, props.rooms, chatId);
}

// Either read failing leaves the line as it last stood: it is a way into the log, never the log itself.
async function read(): Promise<void> {
  const base = `/api/supervisors/${encodeURIComponent(props.name)}`;
  const [listed, standing] = await Promise.allSettled([$fetch<SupervisorRoomView[]>(`${base}/rooms`), $fetch<{ standIn: StandInView | null }>(`${base}/stand-in`)]);

  if (listed.status === "fulfilled") rooms.value = listed.value;
  if (standing.status === "fulfilled") standIn.value = standing.value.standIn;
}

onMounted(() => void read());

usePolling(() => {
  if (document.visibilityState === "visible") void read();
}, READ_MS);
</script>
