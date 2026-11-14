<template>
  <!-- A supervisor's rooms, at the left of its screen's own row (docs/web.md, 「Agent screen」): one menu choosing among
       every room its turns went into, the latest first, each opening this screen's log at its latest run there, then
       a mark while its road cannot take a turn now, the agency's sentence for why in its tooltip. -->
  <div
    v-if="closed || rooms.length > 0"
    class="flex min-w-0 items-center gap-2"
    role="group"
    :aria-label="$t('agents.aria.supervisor_rooms', { name: props.label })"
    data-supervisor-rooms
  >
    <UDropdownMenu v-if="rooms.length > 0" :items="items" :content="{ align: 'start' }" :ui="{ content: 'max-w-80' }">
      <UTooltip :text="$t('agents.aria.supervisor_rooms', { name: props.label })">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-material-symbols-forum-outline"
          trailing-icon="i-material-symbols-keyboard-arrow-down"
          class="min-w-0"
          :ui="{ label: 'truncate' }"
          :label="current === null ? $t('common.label.room') : titleOf(current.chatId)"
          :aria-label="$t('agents.aria.supervisor_rooms', { name: props.label })"
          data-supervisor-room-menu
        />
      </UTooltip>
    </UDropdownMenu>

    <HintTip v-if="closed" :text="roadState?.reason ?? undefined" :disabled="roadState?.reason == null" class="flex min-w-0">
      <UBadge class="min-w-0" color="warning" variant="subtle" :label="$t('agents.status.road_closed')" :ui="{ label: 'truncate' }" data-road-closed />
    </HintTip>
  </div>
</template>

<script setup lang="ts">
import { formatStamp } from "bmo-ui/app/domain/time";

import { roomTitle } from "~/domain/agents";
import { countText } from "~/domain/numbers";
import { usePolling } from "~/domain/polling";

import type { SupervisorRoadStateView, SupervisorRoomView } from "#shared/axes";
import type { RoomSummary } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  name: string;
  label: string;
  // The run the screen stands at, whose room is marked.
  run?: string | null;
  rooms?: RoomSummary[];
}

const props = withDefaults(defineProps<Props>(), { run: null, rooms: () => [] });

const { t } = useI18n();

// How often the rooms and the road are read again while the screen stands and is seen.
const READ_MS = 30_000;

const rooms = ref<SupervisorRoomView[]>([]);
const roadState = ref<SupervisorRoadStateView | null>(null);

const closed = computed(() => roadState.value?.answers === false);

// The room whose latest run the screen stands at, which the menu's button names.
const current = computed<SupervisorRoomView | null>(() => rooms.value.find((room) => room.lastRun === props.run) ?? null);

// Each room by its title, with how many of its runs went there and when the latest began, opening this screen's log at
// that latest run; the room the screen stands at is marked.
const items = computed<DropdownMenuItem[]>(() =>
  rooms.value.map((room) => ({
    label: titleOf(room.chatId),
    description: t("agents.label.room_runs_last", { n: countText(room.runs), time: startedText(room) }),
    to: { path: `/agents/${encodeURIComponent(props.name)}`, query: { run: room.lastRun } },
    active: room.lastRun === props.run,
    "aria-label": t("agents.aria.room_last_run", { room: titleOf(room.chatId), n: countText(room.runs), time: startedText(room) }),
    "data-supervisor-room": ""
  }))
);

function startedText(room: SupervisorRoomView): string {
  return formatStamp(Math.floor(room.lastStartedAt / 1000));
}

function titleOf(chatId: number): string {
  return roomTitle(t, props.rooms, chatId);
}

// A rooms read failing leaves the menu as it last stood: it is a way into the log, never the log itself. A road read
// failing says nothing of the road, so its mark goes.
async function read(): Promise<void> {
  const base = `/api/supervisors/${encodeURIComponent(props.name)}`;
  const [listed, road] = await Promise.allSettled([$fetch<SupervisorRoomView[]>(`${base}/rooms`), $fetch<SupervisorRoadStateView>(`${base}/road`)]);

  if (listed.status === "fulfilled") rooms.value = listed.value;
  roadState.value = road.status === "fulfilled" ? road.value : null;
}

onMounted(() => void read());

usePolling(() => {
  if (document.visibilityState === "visible") void read();
}, READ_MS);
</script>
