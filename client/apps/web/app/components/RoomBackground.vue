<template>
  <!-- What waits for this room, for the administrator alone (docs/web.md, the room screen's list of what waits): a watch, a reminder or a call
       an agent left running, and a supervisor's background subagent or shell command, read as the screen opens, every
       minute, at each opening and as the agency says background work of the room began or ended. It stands nowhere while
       none waits. On a wide screen it is a button with how many, opening the list over it, however short the bar
       stands; on a narrow screen the room's menu opens the list, as a drawer from the screen's foot, so the bar keeps
       room for the room's name. -->
  <template v-if="calls.length > 0">
    <UPopover v-if="!narrow" v-model:open="open" :content="{ align: 'end' }">
      <UTooltip :text="$t('room.label.background')">
        <UButton
          icon="i-material-symbols-pending-actions"
          color="neutral"
          variant="ghost"
          :aria-label="$t('room.aria.background_open', { n: countText(calls.length) })"
          data-room-background
        >
          <span class="text-sm tabular-nums">{{ countText(calls.length) }}</span>
        </UButton>
      </UTooltip>

      <template #content>
        <RoomBackgroundList :calls="calls" />
      </template>
    </UPopover>
    <UDrawer v-else v-model:open="open" :title="$t('room.label.background')">
      <template #body>
        <RoomBackgroundList :calls="calls" />
      </template>
    </UDrawer>
  </template>
</template>

<script setup lang="ts">
import { useNarrow } from "bmo-ui/app/domain/screen";

import { useLiveRefresh } from "~/domain/events";
import { countText } from "~/domain/numbers";

import type { BackgroundCall, BackgroundView } from "#shared/types";

interface Props {
  chatId: number;
}

const props = defineProps<Props>();

const calls = ref<BackgroundCall[]>([]);
// Whether the list stands open; the room's menu opens it on a narrow screen.
const open = defineModel<boolean>("open", { default: false });
// How many wait, for the room's menu that stands the entry on a narrow screen.
const count = defineModel<number>("count", { default: 0 });
const narrow = useNarrow();

// How often the list is read again while the screen stands.
const EVERY_MS = 60_000;

async function read(): Promise<void> {
  try {
    calls.value = (await $fetch<BackgroundView>(`/api/rooms/${props.chatId}/background`)).calls;
  } catch {
    calls.value = [];
  }

  count.value = calls.value.length;
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void read();
  timer = setInterval(() => void read(), EVERY_MS);
});

onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer);
});

// Background work of this room beginning or ending is told by the agency, so the list stands it from the turn's end
// and lets it go as it ends; the tool host tells nothing, so its calls wait on the minute's read.
useLiveRefresh(() => void read(), { on: ["agency-background"], where: (event) => event.chatId === props.chatId });

// A room changed under the same screen reads its own list; an opened list is read afresh.
watch(() => props.chatId, () => void read());
watch(open, (now) => {
  if (now) void read();
});
</script>
